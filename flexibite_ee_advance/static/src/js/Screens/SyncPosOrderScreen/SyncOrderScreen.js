odoo.define('flexibite_ee_advance.SyncOrderScreen', function (require) {
    'use strict';

    const { useState } = owl.hooks;
    const models = require('point_of_sale.models');
    const Registries = require('point_of_sale.Registries');
    const IndependentToOrderScreen = require('point_of_sale.IndependentToOrderScreen');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const { useListener, useAutofocus } = require('web.custom_hooks');
    const { posbus } = require('point_of_sale.utils');
    const { parse } = require('web.field_utils');


    class SyncOrderScreen extends IndependentToOrderScreen {
        constructor() {
            super(...arguments);
            useListener('close-screen', this._onCloseScreen);
            useListener('filter-selected', this._onFilterSelected);
            useListener('search', this._onSearch);
//            useListener('click-order', this._onClickOrder);
            useListener('delete-order', this._onDeleteOrder);
            useListener('pay-order', this._onPayOrder);
            useListener('next-page', this._onNextPage);
            useListener('prev-page', this._onPrevPage);
            useAutofocus({ selector: '.search input' });
            this.state = useState({screenDate: []});
            NumberBuffer.use({
                nonKeyboardInputEvent: 'numpad-click-input',
            });
            this._state = this.env.pos.TICKET_SCREEN_STATE;
            this.state = useState({
                showSearchBar: !this.env.isMobile,
            });
            const defaultUIState = this.props.reuseSavedUIState
                ? this._state.ui
                : {
                      selectedSyncedOrderId: null,
                      searchDetails: this.env.pos.getDefaultSearchDetails(),
                      filter: null,
                      selectedOrderlineIds: {},
                  };
            Object.assign(this._state.ui, defaultUIState, this.props.ui || {});
        }
        async willMount(){
            await super.willMount();
            this.state.screenDate = await this.env.pos.get_kitchen_screen_data();
        }
        //#region LIFECYCLE METHODS
        mounted() {
            posbus.on('ticket-button-clicked', this, this.close);
            this.env.pos.get('orders').on('add remove change', () => this.render(), this);
            this.env.pos.on('change:selectedOrder', () => this.render(), this);
            setTimeout(() => {
                // Show updated list of synced orders when going back to the screen.
                this._onFilterSelected({ detail: { filter: this._state.ui.filter } });
            });
        }
        willUnmount() {
            posbus.off('ticket-button-clicked', this);
            this.env.pos.get('orders').off('add remove change', null, this);
            this.env.pos.off('change:selectedOrder', null, this);
        }
        _onCloseScreen() {
            this.close();
        }
        async _onFilterSelected(event) {
            this._state.ui.filter = event.detail.filter;
            if (this._state.ui.filter == 'SYNCED') {
                await this._fetchSyncedOrders();
            }
            this.render();
        }
        async _onSearch(event) {
            Object.assign(this._state.ui.searchDetails, event.detail);
            if (this._state.ui.filter == 'SYNCED') {
                this._state.syncedOrders.currentPage = 1;
                await this._fetchSyncedOrders();
            }
            this.render();
        }
        async _onDeleteOrder({ detail: order }) {
            const { confirmed } = await this.showPopup('ConfirmPopup', {
                title: this.env._t('Cancel Order'),
                body: this.env._t(
                    'Would you like to cancel selected order?'
                ),
            });
            if (confirmed) {
                const { confirmed, payload: inputNote } = await this.showPopup('TextAreaPopup', {
                    startingValue: '',
                    title: this.env._t('Add Cancel Order Reason'),
                });
                var order = await this.rpc({
                    model: 'pos.order',
                    method: 'cancel_pos_order',
                    args: [[order.order_id], inputNote]
                });
            }
        }
        async _onPayOrder({ detail: order }){
            var order = await this.rpc({
                model: 'pos.order',
                method: 'export_for_ui',
                args: [[order.order_id]]
            });
            delete order[0].floor;
            delete order[0].table;
            delete order[0].table_id;
            var newOrder = await   new models.Order({}, { pos: this.env.pos, json: order[0]});
            await newOrder.set_is_from_sync_screen(true);
            await this.env.pos.get("orders").add(newOrder);
            await newOrder.save_to_db();
            await this.env.pos.set('selectedOrder', newOrder, {});
            await this.showScreen('PaymentScreen');
        }
        async _onNextPage() {
            if (this._state.syncedOrders.currentPage < this._getLastPage()) {
                this._state.syncedOrders.currentPage += 1;
                await this._fetchSyncedOrders();
            }
            this.render();
        }
        async _onPrevPage() {
            if (this._state.syncedOrders.currentPage > 1) {
                this._state.syncedOrders.currentPage -= 1;
                await this._fetchSyncedOrders();
            }
            this.render();
        }
        //#endregion
        //#region PUBLIC METHODS
        getSelectedSyncedOrder() {
            if (this._state.ui.filter == 'SYNCED') {
                return this._state.syncedOrders.cache[this._state.ui.selectedSyncedOrderId];
            } else {
                return null;
            }
        }
        getSelectedOrderlineId() {
            return this._state.ui.selectedOrderlineIds[this._state.ui.selectedSyncedOrderId];
        }
        shouldShowNewOrderButton() {
            return true;
        }
        async getOrders (){
            return await this.rpc({
                model: 'pos.order',
                method: 'export_for_ui',
                args: [this.env.pos.draft_order_ids],
            });
        }
        // return this.env.pos.kitchenScreenData;
        getFilteredOrderList() {
            if (this._state.ui.filter == 'SYNCED') return this._state.syncedOrders.toShow;
            const filterCheck = (order) => {
                if (this._state.ui.filter && this._state.ui.filter !== 'ACTIVE_ORDERS') {
                    const screen = order.get_screen_data();
                    return this._state.ui.filter === this._getScreenToStatusMap()[screen.name];
                }
                return true;
            };
            const { fieldName, searchTerm } = this._state.ui.searchDetails;
            const searchField = this._getSearchFields()[fieldName];
            const searchCheck = (order) => {
                if (!searchField) return true;
                const repr = searchField.repr(order);
                if (repr === null) return true;
                if (!searchTerm) return true;
                return repr && repr.toString().toLowerCase().includes(searchTerm.toLowerCase());
            };
            const predicate = (order) => {
                return searchCheck(order);
            };
            return this._getOrderList().filter(predicate);
        }
        getDate(order) {
            return moment(order.order_time).format('YYYY-MM-DD hh:mm A');
        }
        getTotal(order) {
            return this.env.pos.format_currency(order.total);
        }
        getEmployee(order) {
            return order.employee ? order.employee.name : '';
        }
        getCustomer(order) {
            return order.get_client_name();
        }
        getCardholderName(order) {
            return order.get_cardholder_name();
        }
        getEmployee(order) {
            return order.employee ? order.employee.name : '';
        }
        getStatus(order) {
            if (order.locked) {
                return this.env._t('Paid');
            } else {
                const screen = order.get_screen_data();
                return this._getOrderStates().get(this._getScreenToStatusMap()[screen.name]).text;
            }
        }
        /**
         * Hide the delete button if one of the payments is a 'done' electronic payment.
         */
        isHighlighted(order) {
            if (this._state.ui.filter == 'SYNCED') {
                const selectedOrder = this.getSelectedSyncedOrder();
                return selectedOrder ? order.backendId == selectedOrder.backendId : false;
            } else {
                const activeOrder = this.env.pos.get_order();
                return activeOrder ? activeOrder.uid == order.uid : false;
            }
        }
        showCardholderName() {
            return this.env.pos.payment_methods.some((method) => method.use_payment_terminal);
        }
        getSearchBarConfig() {
            return {
                searchFields: new Map(
                    Object.entries(this._getSearchFields()).map(([key, val]) => [key, val.displayName])
                ),
                filter: { show: true, options: this._getFilterOptions() },
                defaultSearchDetails: this._state.ui.searchDetails,
                defaultFilter: this._state.ui.filter,
            };
        }
        shouldShowPageControls() {
            return this._state.ui.filter == 'SYNCED' && this._getLastPage() > 1;
        }
        getSelectedClient() {
            const order = this.getSelectedSyncedOrder();
            return order ? order.get_client() : null;
        }
        getPageNumber() {
            if (!this._state.syncedOrders.totalCount) {
                return `1/1`;
            } else {
                return `${this._state.syncedOrders.currentPage}/${this._getLastPage()}`;
            }
        }
        //#endregion
        //#region PRIVATE METHODS
        _doesOrderHaveSoleItem(order) {
            const orderlines = order.get_orderlines();
            if (orderlines.length !== 1) return false;
            const theOrderline = orderlines[0];
            const refundableQty = theOrderline.get_quantity() - theOrderline.refunded_qty;
            return this.env.pos.isProductQtyZero(refundableQty - 1);
        }
        _setOrder(order) {
            this.env.pos.set_order(order);
            if (order === this.env.pos.get_order()) {
                this.close();
            }
        }
        _getOrderList() {
            // return this.env.pos.get_order_list();
            return this.env.pos.kitchenScreenData;
        }
        _getFilterOptions() {
            const orderStates = this._getOrderStates();
            orderStates.set('SYNCED', { text: ''});
            return orderStates;
        }
        _getSearchFields() {
            const fields = {
                RECEIPT_NUMBER: {
                    repr: (order) => order.order_reference,
                    displayName: this.env._t('Receipt Number'),
                    modelField: 'pos_reference',
                },
                CUSTOMER: {
                    repr: (order) => order.customer,
                    displayName: this.env._t('Customer'),
                    modelField: 'partner_id.display_name',
                },
                TABLE: {
                    repr: (order) => order.table,
                    displayName: this.env._t('Table'),
                    modelField: 'table_id.name',
                },
            };
            if (this.showCardholderName()) {
                fields.CARDHOLDER_NAME = {
                    repr: (order) => order.get_cardholder_name(),
                    displayName: this.env._t('Cardholder Name'),
                    modelField: 'payment_ids.cardholder_name',
                };
            }
            return fields;
        }
        _getScreenToStatusMap() {
            return {
                ProductScreen: 'ONGOING',
                PaymentScreen: 'PAYMENT',
                ReceiptScreen: 'RECEIPT',
            };
        }
        async _onBeforeDeleteOrder(order) {
            return true;
        }
        _getOrderStates() {
            const states = new Map();
            return states;
        }
        //#region SEARCH SYNCED ORDERS
        _computeSyncedOrdersDomain() {
            const { fieldName, searchTerm } = this._state.ui.searchDetails;
            if (!searchTerm) return [];
            const modelField = this._getSearchFields()[fieldName].modelField;
            if (modelField) {
                return [[modelField, 'ilike', `%${searchTerm}%`]];
            } else {
                return [];
            }
        }
        /**
         * Fetches the done orders from the backend that needs to be shown.
         * If the order is already in cache, the full information about that
         * order is not fetched anymore, instead, we use info from cache.
         */
        async _fetchSyncedOrders() {
            const domain = this._computeSyncedOrdersDomain();
            const limit = this._state.syncedOrders.nPerPage;
            const offset = (this._state.syncedOrders.currentPage - 1) * this._state.syncedOrders.nPerPage;
            const { ids, totalCount } = await this.rpc({
                model: 'pos.order',
                method: 'search_paid_order_ids',
                kwargs: { config_id: this.env.pos.config.id, domain, limit, offset },
                context: this.env.session.user_context,
            });
            const idsNotInCache = ids.filter((id) => !(id in this._state.syncedOrders.cache));
            if (idsNotInCache.length > 0) {
                const fetchedOrders = await this.rpc({
                    model: 'pos.order',
                    method: 'export_for_ui',
                    args: [idsNotInCache],
                    context: this.env.session.user_context,
                });
                // Check for missing products and load them in the PoS
                await this.env.pos._loadMissingProducts(fetchedOrders);
                // Cache these fetched orders so that next time, no need to fetch
                // them again, unless invalidated. See `_onInvoiceOrder`.
                fetchedOrders.forEach((order) => {
                    this._state.syncedOrders.cache[order.id] = new models.Order({}, { pos: this.env.pos, json: order });
                });
            }
            this._state.syncedOrders.totalCount = totalCount;
            this._state.syncedOrders.toShow = ids.map((id) => this._state.syncedOrders.cache[id]);
        }
        _getLastPage() {
            const totalCount = this._state.syncedOrders.totalCount;
            const nPerPage = this._state.syncedOrders.nPerPage;
            const remainder = totalCount % nPerPage;
            if (remainder == 0) {
                return totalCount / nPerPage;
            } else {
                return Math.ceil(totalCount / nPerPage);
            }
        }
        //#endregion
        //#endregion
    }
    SyncOrderScreen.template = 'SyncOrderScreen';
    SyncOrderScreen.defaultProps = {
        destinationOrder: null,
        // When passed as true, it will use the saved _state.ui as default
        // value when this component is reinstantiated.
        // After setting the default value, the _state.ui will be overridden
        // by the passed props.ui if there is any.
        reuseSavedUIState: false,
        ui: {},
    };

    Registries.Component.add(SyncOrderScreen);

    return SyncOrderScreen;
});
