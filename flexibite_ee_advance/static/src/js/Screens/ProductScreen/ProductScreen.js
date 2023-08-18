odoo.define('flexibite_ee_advance.ProductScreen', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const NumberBuffer = require('point_of_sale.NumberBuffer');
    const { Gui } = require('point_of_sale.Gui');
    const { useListener } = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const { useRef, useState } = owl.hooks;
    var rpc = require('web.rpc');
    const { _t } = require('web.core');

    const TRANSLATED_CASH_MOVE_TYPE = {
        in: _t('in'),
        out: _t('out'),
    };

    const AsplRetProductScreenInh = (ProductScreen) =>
        class extends ProductScreen {
            constructor(){
                super(...arguments);
                useListener('button-click', this._onButtonClick);
                useListener('close-warehouse-screen', this._closeWarehouse);
                useListener('show-warehouse-receipt', this._showWarehouseReceipt);
                useListener('select-line', this._changeWarehouseProduct);
                useListener('is_packaging', this.is_packaging_product);
                useListener('close-draft-screen', this.closeScreen);
                useListener('set-order-type-mode', this._setOrderTypeMode);
                useListener('empty-cart', this.EmptyCartButtonClick);
                useListener('show-warehouse', this.ShowWarehouseQty);
                useListener('create-internal-transfer', this.CreateInternalTransfer);
                useListener('add_wallet_amount', this.AddWalletAmount);
                useListener('open-gift-card-screen', this.OpenGiftCardScreen);
                useListener('open-gift-voucher-screen', this.OpenGiftVoucherScreen);
                useListener('apply-bag-charges', this.ApplyBagCharges);
                useListener('create-money-in-out', this.CreateMoneyInOut);
                useListener('open-purchase-history-popup', this.OpenPurchaseHistoryPopup);
                useListener('show-order-return-screen', this.ShowOrderReturnScreen);
                useListener('show-order-note-popup', this.ShowOrderNotePopup);
                useListener('click-extra-recipe', this.exShowOrderNotePopup);
                useListener('show-order-sync', this.ShowOrderSync);
                useListener('add-delivery-charge', this.AddDeliveryCharge);
                useListener('open-control-button', this._toggleControlButton);
                useListener('show-material-monitor', this.ShowMaterialMonitorScreen);
                this.state.warehouse_mode = false;
                this.state.warehouseData = [];
                this.state.serials = [];
                this.state.isPackaging = false
                this.state.title = '';
                const currentOrder = this.env.pos.get_order();
                this.state = useState({...this.state, is_packaging_filter: false, is_connected: true,
                                        orderTypeMode: currentOrder.get_order_type(), controlButton: true,
                                        orderDeliveryService: currentOrder.get_delivery_service()});
                currentOrder.set_order_type(this.state.orderTypeMode)
                currentOrder.set_delivery_service(this.state.orderDeliveryService)
            }
            _toggleControlButton(){
                this.state.controlButton = !this.state.controlButton;
            }
            get addClass(){
                return this.state.controlButton ? 'fa-home' : 'fa-close';
            }
            get toggle() {
                return this.state.controlButton ? 'highlight-custom' : '';
            }
            get highlight() {
                return this.state.controlButton ? '':'open highlight';
            }
            async connectionCheck(){
                var self = this;
                try {
                    await rpc.query({
                        model: 'pos.session',
                        method: 'connection_check',
                        args: [this.env.pos.pos_session.id],
                    });
                    self.state.is_connected = true
                    self.env.pos.get_order().set_connected(true)
                } catch (error) {
                    self.env.pos.get_order().set_connected(false)
                    self.state.is_connected = false
                    if (error instanceof Error) {
                        throw error;
                    } else {
                        // NOTE: error here is most probably undefined
                        this.showPopup('ErrorPopup', {
                            title: this.env._t('Network Error'),
                            body: this.env._t('Please check your internet connection and try again.'),
                        });
                    }
                }
            }
            getTypeName(id){
                return this.env.pos.order_type_data[id][0];
            }
            async changeMode(id) {
                this.state.orderTypeMode = this.env.pos.order_type_data[id][0];
                if (this.env.pos.order_type_data && this.env.pos.order_type_data[id] && this.env.pos.order_type_data[id][0] && this.env.pos.order_type_data[id][0] === 'Delivery'){
                    var delivery_service_ids = this.env.pos.delivery_service.filter(service => this.env.pos.config.delivery_service_ids.includes(service.id))
                    const { confirmed, payload } = await this.showPopup('DeliveryServicePopup', {
                        title: this.env._t('Select Delivery Service'),
                        services: delivery_service_ids,
                        selected_service: this.state.orderDeliveryService
                    });
                    if (confirmed){
                        this.currentOrder.set_delivery_service(payload.SelectedService)
                        this.state.orderDeliveryService = payload.SelectedService
                    }
                }else{
                    this.currentOrder.set_delivery_service(null)
                }
                this.trigger('set-order-type-mode',this.state.orderTypeMode);
                this.currentOrder.set_order_type(this.state.orderTypeMode);
            }
            orderIsEmpty(order) {
                var self = this;
                var currentOrderLines = order.get_orderlines();
                var lines_ids = []
                if(!order.is_empty()) {
                    _.each(currentOrderLines,function(item) {
                        lines_ids.push(item.id);
                    });
                    _.each(lines_ids,function(id) {
                        order.remove_orderline(order.get_orderline(id));
                    });
                }

            }
            async ShowOrderSync(){
                this.showScreen('OrderScreen');
            }

            async exShowOrderNotePopup(event){
                console.log("event",event, this.env.pos.product_id);
                var selectedOrder = this.env.pos.get_order();
                var order_line = selectedOrder.get_orderlines();
                var combo_ids = [];
                console.log("Order line currenrt",order_line, order_line['combolines'] );
                _.each(order_line,function(item) {
                    console.log('itemitemitem',item.combolines);
                    for (const line of item.combolines){
                        combo_ids.push({
                                    'product_id': line.categoryName,
                                    'quantity':line.quantity
                                    
                                });


                    }
                    /*var bom_id = {
                            model: 'pos.order.line',
                            method: 'assign_bom',
                            args: [item.product.id]
                        }*/

                    /*let bom_model = _.find(this.models, (model) => model.model === 'mrp.bom');
                    var domain = [['product_id','in', item.product.id]];

                    var bom =this.rpc({
                        model: 'mrp.bom',
                        method: 'search_read',
                        kwargs: {
                            'domain': domain,
                            'fields': bom_model.fields,                        
                            'limit': 1
                        }

                    console.log("bom_id",bom)*/
                    //console.log('itemitemitem',item.product.bom_id);

                });
                /*console.log('66666666666',product_id);
                var extrarecipe = [];
                var como=[]
                const combo_ids = [];
                _.each(order_line,function(item) {
                        console.log('itemitemitem',item.product.product_tmpl_id.id, item.product.product_combo_ids);
                       
                            if(item.product.product_combo_ids){
                                for(const line of item.product.product_combo_ids){
                                    combo_ids.push(line.pos_category_id);
                                }

                                como.push(item.product.product_combo_ids)

                            
                        }
                _.each(como,function(com){

                    console.log('%%%%%%%%%%%',com.display_name, combo_ids);
                });

                       
                        
                    });
                console.log("Extra3333333333333",extrarecipe, combo_ids);*/

                console.log('combo_ids',combo_ids)
                const { confirmedm, payload: inputNote} = await this.showPopup('ExtraRecipePopup', {
                    
                    title: this.env._t('Extra Recipe'),
                    body: combo_ids,


                });

            }


            async ShowOrderNotePopup(){

                const { confirmed, payload: inputNote } = await this.showPopup('ProductNotePopup', {
                    startingValue: this.env.pos.get_order().get_order_note(),
                    title: this.env._t('Order Note'),
                   
                });

                if (confirmed) {
                    var order = this.env.pos.get_order();
                    this.env.pos.get_order().set_order_note(inputNote);
                    if(this.env.pos.config.customer_display){
                        order.mirror_image_data();

                    }
                }
            }
            async EmptyCartButtonClick(){
                var self = this;
                var order = self.env.pos.get_order();
                var lines = order.get_orderlines();
                if(lines.length > 0){
                    const { confirmed } = await this.showPopup('ConfirmPopup', {
                        title: 'Empty Cart ?',
                        body: 'You will lose all items associated with the current order',
                    });
                    if (confirmed) {
                        self.orderIsEmpty(order);
                        if(self.env.pos.config.customer_display){
                            order.mirror_image_data();
                        }
                    }
                }
            }
            // if AddDeliveryCharge is enable
            async AddDeliveryCharge(){
                await this.connectionCheck()
                if (this.env.pos.get_order().get_connected()){
                    const { confirmed, payload: DeliveryData } = await this.showPopup('DeliveryChargePopup', {
                        title: this.env._t('Delivery Detail'),
                        address: this.env.pos.get_order().get_client() ? this.env.pos.get_order().get_client().address : '',
                        data: this.env.pos.get_order().get_delivery_charge_data()
                    });
                    if (confirmed){
                        this.env.pos.get_order().set_delivery_charge(this.env.pos.config.delivery_product_amount)
                        this.env.pos.get_order().set_delivery_charge_data(DeliveryData)

                    }
                }else{
                    this.env.pos.get_order().set_connected(false)
                }
            }
            // if Display Stock is enable
            async ShowWarehouseQty(){
                await this.connectionCheck()
                if (this.env.pos.get_order().get_connected()){
                    this._onButtonClick();
                }
                else{
                    this.env.pos.get_order().set_connected(false)
                }
            }
            // if Internal Stock Transfer is enable
            async CreateInternalTransfer(){
                var self = this
                await this.connectionCheck()
                if (this.env.pos.get_order().get_connected()){
                    var selectedOrder = this.env.pos.get_order();
                    var currentOrderLines = selectedOrder.get_orderlines();
                    let flag;
                    _.each(currentOrderLines,function(item) {
                        if(item.product.type === "product"){
                            flag = true;
                            return;
                        }
                    });

                    if(!flag){
                        alert("No Storable Product Found!");
                        return;
                    }
                    const { confirmed, payload: popup_data} = await this.showPopup('internalTransferPopup',
                                                                                    {title: this.env._t('Internal Transfer')});
                    if (confirmed){
                        var moveLines = [];
                        _.each(currentOrderLines,function(item) {
                            if(item.product.type === "product"){
                                let product_name = item.product.default_code ?
                                            "["+ item.product.default_code +"]"+ item.product.display_name :
                                            item.product.display_name;

                                moveLines.push({
                                    'product_id': item.product.id,
                                    'name': product_name,
                                    'product_uom_qty': item.quantity,
                                    'location_id': Number(popup_data.SourceLocation),
                                    'location_dest_id': Number(popup_data.DestLocation),
                                    'product_uom': item.product.uom_id[0],
                                });
                            }
                        });

                        var move_vals = {
                            'picking_type_id': Number(popup_data.PickingType),
                            'location_src_id':  Number(popup_data.SourceLocation),
                            'location_dest_id': Number(popup_data.DestLocation),
                            'state': popup_data.stateOfPicking,
                            'moveLines': moveLines,
                        }
                        await rpc.query({
                            model: 'stock.picking',
                            method: 'internal_transfer',
                            args: [move_vals],
                        }).then(function (result) {
                            if(result && result[0] && result[0]){
                                var url = window.location.origin + '/web#id=' + result[0] + '&view_type=form&model=stock.picking';
                                const { confirmed, payload} = self.showPopup('PurchaseOrderCreate', {
                                    title: self.env._t('Confirmation'),
                                    SelectedProductList:[],
                                    defination: 'Internal Transfer Created',
                                    CreatedPurchaseOrder:'True',
                                    CreatedInternalTransfer:'True',
                                    order_name:result[1],
                                    order_id:result[0],
                                    url:url,
                                });
                                self.selectedProductList = [];
                            }
                        });
                    }
                }else{
                    this.env.pos.get_order().set_connected(false)
                }
            }
            // if Wallet is enable
            async AddWalletAmount(){
                await this.connectionCheck()
                if (this.env.pos.get_order().get_connected()){
                    if(this.env.pos.get_order().get_client()){
                        const { confirmed,payload } = await this.showPopup('WalletPopup', {
                            title: this.env._t('Add to Wallet'),
                            customer: this.env.pos.get_order().get_client().name,
                        });
                        if (confirmed) {
                            if(this.env.pos.get_order().get_orderlines().length > 0){
                                const { confirmed } = await this.showPopup('ConfirmPopup', {
                                    title: this.env._t('would you like to discard this order?'),
                                    body: this.env._t(
                                        'If you want to recharge wallet then you have to discard this order'
                                    ),
                                });
                                if (confirmed) {
                                    this.orderIsEmpty(this.env.pos.get_order());
                                }
                            }
                            var product_id = this.env.pos.config.wallet_product[0]
                            var product = this.env.pos.db.get_product_by_id(product_id)
                            var amount = payload["amount"]
                            this.env.pos.get_order().set_is_rounding(false)
                            this.env.pos.get_order().set_type_for_wallet('change');
                            this.env.pos.get_order().add_product(product, {
                                price: amount,
                                extras: {
                                    price_manually_set: true,
                                },
                            });
                            this.showScreen('PaymentScreen');
                        }
                    }
                }else{
                    this.env.pos.get_order().set_connected(false)
                }
            }
            // if Gift Card is enable
            async OpenGiftCardScreen(){
                await this.connectionCheck()
                if (this.env.pos.get_order().get_connected()){
                    this.showScreen('GiftCardScreen');
                }else{
                    this.env.pos.get_order().set_connected(false)
                }
            }
            // if Gift Voucher is enable
            async OpenGiftVoucherScreen(){
                await this.connectionCheck()
                if (this.env.pos.get_order().get_connected()){
                    this.showScreen('GiftVoucherScreen');
                }else{
                    this.env.pos.get_order().set_connected(false)
                }
            }
            // if Gift Voucher is enable
            ApplyBagCharges(){
                var product_dict = this.env.pos.db.product_by_id
                var product_by_id = _.filter(product_dict, function(product){
                    return product.is_packaging;
                });
                this.state.is_packaging_filter = !this.state.is_packaging_filter
                this.trigger('is_packaging', product_by_id);
            }
            // if Money In/Out is enable
            async CreateMoneyInOut(event){
                await this.connectionCheck()
                if (this.env.pos.get_order().get_connected()){
                    const { confirmed, payload } = await this.showPopup('CashMovePopup');
                    if (!confirmed) return;
                    try {
                        if(!this.env.pos.config.cash_control){
                            this.env.pos.db.notification('danger',this.env._t("Please enable cash control from point of sale settings."));
                            return;
                        }
                        const { type, amount, reason } = payload;
                        const translatedType = TRANSLATED_CASH_MOVE_TYPE[type];
                        const formattedAmount = this.env.pos.format_currency(amount);
                        if (!amount) {
                            return this.showNotification(
                                _.str.sprintf(this.env._t('Cash in/out of %s is ignored.'), formattedAmount),
                                3000
                            );
                        }
                        const extras = { formattedAmount, translatedType };
                        await this.rpc({
                            model: 'pos.session',
                            method: 'try_cash_in_out',
                            args: [[this.env.pos.pos_session.id], type, amount, reason, extras],
                        });
                        if (this.env.pos.proxy.printer) {
                            const renderedReceipt = this.env.qweb.renderToString('point_of_sale.CashMoveReceipt', {
                                _receipt: this._getReceiptInfo({ ...payload, translatedType, formattedAmount }),
                            });
                            const printResult = await this.env.pos.proxy.printer.print_receipt(renderedReceipt);
                            if (!printResult.successful) {
                                this.showPopup('ErrorPopup', { title: printResult.message.title, body: printResult.message.body });
                            }
                        }
                        this.showNotification(
                            _.str.sprintf(this.env._t('Successfully made a cash %s of %s.'), type, formattedAmount),
                            3000
                        );
                    } catch (error) {
                        if (error.message.code < 0) {
                            await this.showPopup('OfflineErrorPopup', {
                                title: this.env._t('Offline'),
                                body: this.env._t('Unable to change background color'),
                            });
                        } else {
                            throw error;
                        }
                    }
                }else{
                    this.env.pos.get_order().set_connected(false);
                }
            }
            _getReceiptInfo(payload) {
                const result = { ...payload };
                result.cashier = this.env.pos.get_cashier();
                result.company = this.env.pos.company;
                return result;
            }
            async OpenPurchaseHistoryPopup(){
                var self = this
                const currentOrder =  this.env.pos.get_order();
                const currentOrderClient = currentOrder.get_client()
                await this.connectionCheck()
                if (currentOrder.get_connected() && currentOrderClient){
                    const product_ids = [];
                    const orderLines = currentOrder.get_orderlines()
                    if (orderLines && orderLines.length > 0) {
                        for(const line of orderLines){
                            product_ids.push(line.product.id);
                        }
                        const orderHistory = await this.rpc({
                                                model: 'pos.order',
                                                method: 'get_all_product_history',
                                                args: [product_ids, currentOrderClient.id],
                                            });
                        const { confirmed, payload: popup_data} = await self.showPopup('PurchaseHistoryPopup', {
                                    last_purchase_history: orderHistory.res_last_purchase_history,
                                    product_history: orderHistory.res_product_history,
                                    last_order_date: orderHistory.date_order,
                                    last_order_name: orderHistory.order_name,
                                });
                    }
                }else{
                    this.env.pos.get_order().set_connected(false)
                }
            }
            async ShowOrderReturnScreen(){
                await this.connectionCheck()
                if (this.env.pos.get_order().get_connected()){
                    this.showScreen('OrderReturnScreen');
                }else{
                   this.env.pos.get_order().set_connected(false)
                }
            }
            ShowMaterialMonitorScreen(){
                this.showScreen('MaterialMonitorScreen');
            }
            _setOrderTypeMode(event) {
                const { mode } = event.detail;
                this.state.orderTypeMode = event.detail;
            }
            async product_lot_and_serial_number(event){
                var self = this
                var product_id = event.product_id
                var isAllowOnlyOneLot = event.isAllowOnlyOneLot
                var selectedSerial = event.selectedSerial || false
                var picking_type = this.env.pos.config.picking_type_id[0]
                var selectedSerialName = []
                let draftPackLotLines, weight, description, packLotLinesToEdit;
                if (selectedSerial){
                    for(var i=0 ; i < selectedSerial.length ; i++){
                        selectedSerialName.push(selectedSerial[i]['lot_name'])
                    }
                }
                var params = {
                    model: 'stock.production.lot',
                    method: 'product_lot_and_serial',
                    args: [product_id, product_id, picking_type]
                }
                try {
                    await rpc.query(params).then(async function(serials){
                        if(serials){
                             for(var i=0 ; i < serials.length ; i++){
                                 if(serials[i].remaining_qty > 0){
                                    if (selectedSerialName.length > 0 && selectedSerialName.indexOf(serials[i]['display_name']) > -1) {
                                        serials[i]['isSelected'] = true;
                                        //In the array!
                                    }else{
                                        serials[i]['isSelected'] = false;
                                    }
                                    serials[i]['inputQty'] = 1;
                                    if(serials[i].expiration_date){
                                        let localTime =  moment.utc(serials[i].expiration_date).toDate();
                                        serials[i]['expiration_date'] = moment(localTime).locale('en').format('YYYY-MM-DD hh:mm A');
                                    }
                                    self.state.serials.push(serials[i])
                                 }
                             }
                             self.state.serials.sort(function(a,b){
                                  return (b.expiration_date) - (a.expiration_date);
                             });
                             self.showScreen('PackLotLineScreen', {isSingleItem : isAllowOnlyOneLot,
                                                                   serials : self.state.serials});
                        }
                    });
                } catch (error) {
                    self.env.pos.get_order().set_connected(false);
                    if (error instanceof Error) {
                        throw error;
                    } else {
                        const { confirmed, payload } = await this.showPopup('EditListPopup', {
                            title: this.env._t('Lot/Serial Number(s) Required'),
                            isSingleItem: isAllowOnlyOneLot,
                            array: packLotLinesToEdit,
                        });
                        if (confirmed) {
                            // Segregate the old and new packlot lines
                            const modifiedPackLotLines = Object.fromEntries(
                                payload.newArray.filter(item => item.id).map(item => [item.id, item.text])
                            );
                            const newPackLotLines = payload.newArray
                                .filter(item => !item.id)
                                .map(item => ({ lot_name: item.text }));
                            draftPackLotLines = { modifiedPackLotLines, newPackLotLines };
                        } else {
                            // We don't proceed on adding product.
                            return;
                        }
                    }
                }
            }
            closeScreen(){
                this.trigger('show-orders-panel');
            }
            async _setValue(val){
                var line = this.currentOrder.get_selected_orderline()
                if (this.currentOrder.get_selected_orderline()) {
                    if(line.state != 'Waiting' && this.state.numpadMode === 'quantity'){
                        this.showNotification('You can not change the quantity!')
                        return;
                    }
                    var discount_limit = this.env.pos.user.discount_limit;
                    var managers = this.env.pos.config.pos_managers_ids;
                    if(this.env.pos.config.enable_operation_restrict){
                        if (this.state.numpadMode === 'quantity') {
                            const result = this.currentOrder.get_selected_orderline().set_quantity(val);
                            if (!result) NumberBuffer.reset();
                        } else if (this.state.numpadMode === 'discount') {
                            if(val <= discount_limit || discount_limit < 1){
                                this.currentOrder.get_selected_orderline().set_discount(val);
                            } else {
                                if(_.contains(managers,this.env.pos.user.id)){
                                    this.currentOrder.get_selected_orderline().set_discount(val);
                                    return;
                                }
                                if(managers.length > 0){
                                    const { confirmed,payload: enteredPin } = await this.showPopup('AuthenticationPopup', {
                                        title: this.env._t('Authentication'),
                                    });
                                    if(confirmed){
                                        const userFiltered = this.env.pos.users.filter(user => managers.includes(user.id));
                                        var result_find = _.find(userFiltered, function (user) {
                                            if(user.based_on == 'barcode'){
                                                return user.barcode === enteredPin;
                                            } else{
                                                return user.custom_security_pin === enteredPin;
                                            }
                                        });
                                        if(result_find){
                                            this.currentOrder.get_selected_orderline().set_discount(val);
                                            return;
                                        }else{
                                            alert('Please Enter correct PIN/Barcode!');
                                            return;
                                        }
                                    }
                                } else{
                                    alert('PLease Contact Your Manager!!')
                                    return;
                                }
                            }
                        } else if (this.state.numpadMode === 'price') {
                            var selected_orderline = this.currentOrder.get_selected_orderline();
                            selected_orderline.price_manually_set = true;
                            selected_orderline.set_unit_price(val);
                        }
                        if (this.env.pos.config.iface_customer_facing_display) {
                            this.env.pos.send_current_order_to_customer_facing_display();
                        }
                    }else{
                        await super._setValue(val);
                    }
                }
            }
            quick_delete(order_id){
                var self = this;
                var order_to_be_remove = self.env.pos.db.get_orders_list_by_id(order_id);
                if (order_to_be_remove) {
                    var params = {
                        model: 'pos.order',
                        method: 'unlink',
                        args: [order_to_be_remove.id],
                    }
                    rpc.query(params, {async: false}).then(function(result){});
                }
                var orders_list = self.env.pos.db.get_orders_list();
                orders_list = _.without(orders_list, _.findWhere(orders_list, { id: order_to_be_remove.id }));
                var orderFiltered = orders_list.filter(order => order.state == "draft");
                self.env.pos.db.add_orders(orders_list);
                self.env.pos.db.add_draft_orders(orderFiltered);
                this.trigger('reload-order-count',{ orders_count:orderFiltered.length});
                self.render();
            }
            quick_pay(order_id){
                var self = this;
                var result = self.env.pos.db.get_orders_list_by_id(order_id);
                if(result && result.lines.length > 0){
                    var selectedOrder = this.env.pos.get_order();
                    selectedOrder.destroy();
                    var selectedOrder = this.env.pos.get_order();
                    if (result.partner_id && result.partner_id[0]) {
                        var partner = self.env.pos.db.get_partner_by_id(result.partner_id[0])
                        if(partner){
                            selectedOrder.set_client(partner);
                        }
                    }
                    selectedOrder.set_pos_reference(result.pos_reference);
                    selectedOrder.set_order_id(order_id);
                    selectedOrder.server_id = result.id;

                    selectedOrder.set_sequence(result.name);
                    if(result && result.partner_id && result.partner_id[0]){
                        var partner = self.env.pos.db.get_partner_by_id(result.partner_id[0]);
                        selectedOrder.set_client(partner);
                    }else{
                        selectedOrder.set_client(null);
                    }
                    if(result.salesman_id && result.salesman_id[0]){
                        selectedOrder.set_salesman_id(result.salesman_id[0]);
                    }
                    var order_lines = self.get_orderlines_from_order(result.lines).then(function(order_lines) {
                        if(order_lines && order_lines.length > 0){
                            _.each(order_lines, function(line){
                               if (line.operation_lot_name.length > 0){
                                    var product = self.env.pos.db.get_product_by_id(Number(line.product_id[0]));
                                    let packLotLinesToEdit;
                                    const isAllowOnlyOneLot = product.isAllowOnlyOneLot();
                                    if (isAllowOnlyOneLot) {
                                        packLotLinesToEdit = [];
                                    }
                                    // product_id, isAllowOnlyOneLot, selectedSerial
                                    var lot_argument = {'product_id': product.id, 'isAllowOnlyOneLot': isAllowOnlyOneLot, 'selectedSerial':line.operation_lot_name}
                                    self.product_lot_and_serial_number(lot_argument)
                                    let draftPackLotLines
                                    const modifiedPackLotLines = {}
                                    var newPackLotLines = line.operation_lot_name 
                                    draftPackLotLines = { modifiedPackLotLines, newPackLotLines };
                                    selectedOrder.add_product(product, {
                                        draftPackLotLines,
                                        quantity: line.qty,
                                        discount: line.discount,
                                        price: line.price_unit,
                                    });
                                    selectedOrder.get_selected_orderline().set_serials(self.state.serials)
                               }else{
                                    var product = self.env.pos.db.get_product_by_id(Number(line.product_id[0]));
                                    selectedOrder.add_product(product, {
                                        quantity: line.qty,
                                        discount: line.discount,
                                        price: line.price_unit,
                                    });
                               }
                            });
                            self.trigger('show-orders-panel');
                            self.showScreen('PaymentScreen',{'order_id':order_id});
                        }
                    })
                }
            }
            get_orderlines_from_order(line_ids){
                var self = this;
                var orderLines = [];
                return new Promise(function (resolve, reject) {
                    rpc.query({
                        model: 'pos.order.line',
                        method: 'pos_order_line_read',
                        args: [this, line_ids],
                    }).then(function (order_lines) {
                        resolve(order_lines);
                    })
                });
            }
            get client() { 
                return this.env.pos.get_client();
            }
            _onClickPay() {
                if(this.env.pos.user && this.env.pos.user.kitchen_screen_user === 'waiter'){
                    this.showNotification(this.env._t('You do not have a rights of payment!'));
                }else{
                    this.showScreen('PaymentScreen');
                }
            }
            async _clickProduct(event) {
                if (!this.env.pos.get_order().get_refund_order()){
                    await super._clickProduct(event)
                }else{
                    return false
                }
            }
            async _barcodeProductAction(code) {
                if (!this.env.pos.get_order().get_refund_order()){
                    await super._barcodeProductAction(code)
                }else{
                    return false
                }
            }
            async _getAddProductOptions(product) {
                let price_extra = 0.0;
                let draftPackLotLines, weight, description, packLotLinesToEdit;
                if (this.env.pos.config.product_configurator && _.some(product.attribute_line_ids, (id) => id in this.env.pos.attributes_by_ptal_id)) {
                    let attributes = _.map(product.attribute_line_ids, (id) => this.env.pos.attributes_by_ptal_id[id])
                                      .filter((attr) => attr !== undefined);
                    let { confirmed, payload } = await this.showPopup('ProductConfiguratorPopup', {
                        product: product,
                        attributes: attributes,
                    });

                    if (confirmed) {
                        description = payload.selected_attributes.join(', ');
                        price_extra += payload.price_extra;
                    } else {
                        return;
                    }
                }
                // Gather lot information if required.
                if (['serial', 'lot'].includes(product.tracking) && (this.env.pos.picking_type.use_create_lots || this.env.pos.picking_type.use_existing_lots)) {
                    const isAllowOnlyOneLot = product.isAllowOnlyOneLot();
                    if (isAllowOnlyOneLot) {
                        packLotLinesToEdit = [];
                    } else {
                        const orderline = this.currentOrder
                            .get_orderlines()
                            .filter(line => !line.get_discount())
                            .find(line => line.product.id === product.id);
                        if (orderline) {
                            packLotLinesToEdit = orderline.getPackLotLinesToEdit();
                        } else {
                            packLotLinesToEdit = [];
                        }
                    }
                    if(this.env.pos.config.enable_pos_serial) {
                        var self = this;
                        var utcMoment = moment.utc();
                        var picking_type = this.env.pos.config.picking_type_id[0]
                        // this.product_lot_and_serial_number(product.id, isAllowOnlyOneLot)   
                        try {
                            var params = {
                                model: 'stock.production.lot',
                                method: 'product_lot_and_serial',
                                args: [product, product.id, picking_type]
                            }
                            await rpc.query(params).then(async function(serials){
                                if(serials){
                                    for(var i=0 ; i < serials.length ; i++){
                                        if(serials[i].remaining_qty > 0){
                                            serials[i]['isSelected'] = false;
                                            serials[i]['inputQty'] = 1;
                                            if(serials[i].expiration_date){
                                                let localTime =  moment.utc(serials[i].expiration_date).toDate();
                                                serials[i]['expiration_date'] = moment(localTime).locale('en').format('YYYY-MM-DD hh:mm A');
                                            }
                                            self.state.serials.push(serials[i])
                                        }
                                    }
                                    self.state.serials.sort(function(a,b){
                                        return (b.expiration_date) - (a.expiration_date);
                                    });
                                    self.showScreen('PackLotLineScreen', {isSingleItem : isAllowOnlyOneLot, serials : self.state.serials});
                                }
                            });
                        } catch (error) {
                            self.env.pos.get_order().set_connected(false);
                            if (error instanceof Error) {
                                throw error;
                            } else {
                                const { confirmed, payload } = await this.showPopup('EditListPopup', {
                                    title: this.env._t('Lot/Serial Number(s) Required'),
                                    isSingleItem: isAllowOnlyOneLot,
                                    array: packLotLinesToEdit,
                                });
                                if (confirmed) {
                                    // Segregate the old and new packlot lines
                                    const modifiedPackLotLines = Object.fromEntries(
                                        payload.newArray.filter(item => item.id).map(item => [item.id, item.text])
                                    );
                                    const newPackLotLines = payload.newArray
                                        .filter(item => !item.id)
                                        .map(item => ({ lot_name: item.text }));
                                    draftPackLotLines = { modifiedPackLotLines, newPackLotLines };
                                } else {
                                    // We don't proceed on adding product.
                                    return;
                                }
                            }
                        }
                    }else {
                        const { confirmed, payload } = await this.showPopup('EditListPopup', {
                            title: this.env._t('Lot/Serial Number(s) Required'),
                            isSingleItem: isAllowOnlyOneLot,
                            array: packLotLinesToEdit,
                        });
                        if (confirmed) {
                            // Segregate the old and new packlot lines
                            const modifiedPackLotLines = Object.fromEntries(
                                payload.newArray.filter(item => item.id).map(item => [item.id, item.text])
                            );
                            const newPackLotLines = payload.newArray
                                .filter(item => !item.id)
                                .map(item => ({ lot_name: item.text }));
                            draftPackLotLines = { modifiedPackLotLines, newPackLotLines };
                        } else {
                            // We don't proceed on adding product.
                            return;
                        }
                    }
                    if (product.to_weight && this.env.pos.config.iface_electronic_scale) {
                        // Show the ScaleScreen to weigh the product.
                        if (this.isScaleAvailable) {
                            const { confirmed, payload } = await this.showTempScreen('ScaleScreen', {
                                product,
                            });
                            if (confirmed) {
                                weight = payload.weight;
                            } else {
                                // do not add the product;
                                return;
                            }
                        } else {
                            await this._onScaleNotAvailable();
                        }
                    }
                }
                if(product.is_combo){
                    this._clickCombo(product);
                    var is_merge = false;
                }
                return { draftPackLotLines, quantity: weight, description, price_extra };
            }
             _clickCombo(product){
                this.showScreen('CreateComboScreen', {
                    product:product,
                    mode: 'new',
                });
            }
            is_packaging_product(event) {
                if (this.state.warehouse_mode){
                    this.state.warehouse_mode = false;
                }
                if (this.props.showOrderPanel){
                    this.props.showOrderPanel = false;
                }
                if (this.state.isPackaging === false){
                    this.state.isPackaging = true
                    this.env.pos.set('selectedCategoryId', 0);
                }else{
                    this.state.isPackaging = false
                }
                this.props.products = event.detail
            }
            get productsToDisplay() {
                return this.props.products
                // super.productsToDisplay
            }
            async _onButtonClick(){
                if (this.state.warehouse_mode){
                    this.state.warehouse_mode = false;
                }
                if(this.currentOrder.get_selected_orderline()) {
                    await this._createData();
                    this.state.warehouse_mode = true;
                }
                else{
                    alert('Please Select Product.');
                }
            }
            _closeWarehouse(){
                if (this.state.warehouse_mode){
                    this.state.warehouse_mode = false;
                }
            }
            async _changeWarehouseProduct(event){
                if (this.state.warehouse_mode){
                    await this._createData();
                }
            }
            async _createData(){
                const product = this.currentOrder.get_selected_orderline().product;
                const displayStockData = await this.rpc({
                                model: 'stock.warehouse',
                                method: 'display_prod_stock',
                                args: [product.id]
                            })

                this.state.warehouseData = displayStockData;
                this.state.title = product.display_name;
            }
            async _showWarehouseReceipt(){
                await this.showTempScreen('BillScreen',{'check':'from_warehouse',
                                                        'receiptData':this.state.warehouseData,
                                                        'productName': this.state.title});
            }
        }

    Registries.Component.extend(ProductScreen, AsplRetProductScreenInh);

    return ProductScreen;

});
