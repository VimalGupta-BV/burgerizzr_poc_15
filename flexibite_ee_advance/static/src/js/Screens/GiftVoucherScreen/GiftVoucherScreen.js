    odoo.define('point_of_sale.GiftVoucherScreen', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const { useListener } = require('web.custom_hooks');
    var rpc = require('web.rpc');

    class GiftVoucherScreen extends PosComponent {
        constructor() {
            super(...arguments);
            useListener('close-screen', this.close);
            useListener('click-extend', () => this.extendExpireDate()); 
            useListener('click-recharge', () => this.rechargeGiftCard());
            useListener('click-exchange', () => this.ChangeCardGiftCard());
            useListener('filter-selected', this._onFilterSelected);
            useListener('search', this._onSearch);
            this.searchDetails = {};
            this.filter = null;
            this.state = {
                query: null,
                selectedVoucher: this.props.gift_voucher,
                detailIsShown: false,
                isEditMode: false,
                editModeProps: {
                    partner: {
                        country_id: this.env.pos.company.country_id,
                        state_id: this.env.pos.company.state_id,
                    }
                },
            }
        }
        
        close(){
            this.showScreen('ProductScreen');
        }
        _onFilterSelected(event) {
            this.filter = event.detail.filter;
            this.render();
        }
        async clickVoucher(event) {
            let Voucher = event.detail.voucher;
            if (this.state.selectedVoucher === Voucher) {
                // this.state.selectedVoucher = null;
            } else {
                this.state.selectedVoucher = Voucher;
            }
            await this.rpc({
                model: 'aspl.gift.voucher.redeem',
                method: 'search_read',
                domain: [['voucher_id', '=', this.state.selectedVoucher.id]],
            }, {async: true}).then((gift_voucher) => {
                this.test = gift_voucher
            })
            this.VoucherHistory = this.test
            this.render();
        }

        get highlight() {
            return this.state.selectedVoucher !== this.state.selectedVoucher ? '' : 'highlight';
        }
        // Lifecycle hooks
        back() {
            if(this.state.detailIsShown) {
                this.state.detailIsShown = false;
                this.render();
            } else {
                this.trigger('close-screen');
            }
        }
        get GiftVoucherList() {
            return this.env.pos.gift_vouchers;
        }
        _onSearch(event) {
            Object.assign(this.searchDetails, event.detail);
            this.render();
        }

        get filteredGiftVoucherList() {
            const { fieldName, searchTerm } = this.searchDetails;
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
            return this.GiftVoucherList.filter(predicate);
        }

        getSearchVoucherConfig() {
            return {
                searchFields: new Map(
                    Object.entries(this._getSearchFields()).map(([key, val]) => [key, val.displayName])
                ),
                filter: { show: true, options: this._getFilterOptions() },
                defaultSearchDetails: this.searchDetails,
                defaultFilter: this.filter,
            };
        }

        _getSearchFields() {
            const fields = {
                VOUCHER_NUMBER: {
                    repr: (order) => order.voucher_code,
                    displayName: this.env._t('Voucher Number'),
                    modelField: 'voucher_code',
                },
                VOUCHER_NAME: {
                    repr: (order) => order.voucher_name,
                    displayName: this.env._t('Voucher Name'),
                    modelField: 'voucher_name',
                },
                MINIMUM_PURCHASE: {
                    repr: (order) => order.minimum_purchase,
                    displayName: this.env._t('Minimum Purchase Amount'),
                    modelField: 'minimum_purchase',
                },
                CUSTOMER: {
                    repr: (order) => moment(order.expiry_date).locale('en').format('YYYY-MM-DD hh:mm A'),
                    displayName: this.env._t('Expire Date(YYYY-MM-DD hh:mm A)'),
                    modelField: 'expiry_date',
                },
            };
            return fields;
        }

        _getFilterOptions() {
            const orderStates = this._getOrderStates();
            return orderStates;
        }

        _getOrderStates() {
            // We need the items to be ordered, therefore, Map is used instead of normal object.
            const states = new Map();
            states.set('VOUCHER', {
                text: this.env._t('Voucher'),
            });
            return states;
        }

    }
    GiftVoucherScreen.template = 'GiftVoucherScreen';

    Registries.Component.add(GiftVoucherScreen);

    return GiftVoucherScreen;
});
 