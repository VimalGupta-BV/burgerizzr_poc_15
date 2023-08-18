odoo.define('flexibite_ee_advance.OrderWidgetInh', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const OrderWidget = require('point_of_sale.OrderWidget');
    const Registries = require('point_of_sale.Registries');
    const { useListener } = require('web.custom_hooks');
    const { useRef, useState } = owl.hooks;
    var rpc = require('web.rpc');

    const OrderWidgetInh = (OrderWidget) =>
        class extends OrderWidget {
            constructor(){
                super(...arguments);
                this.state.serials = [];
                useListener('edit-combo-product', this._editComboProduct);
                useListener('combo-product-info', this._comboProductInfo);
            }
            async _editComboProduct(event) {
                const orderline = event.detail.orderline;
                this.showScreen('CreateComboScreen', {
                    product: orderline.product,
                    orderline: orderline,
                    full_name: orderline.get_full_product_name(),
                    edit: true,
                    mode: 'edit',
                });
            }
            async _comboProductInfo(event) {
                const { confirmed } = await this.showPopup(
                    'ComboInfoPopup',
                    {
                        title: event.detail.orderline.product.display_name,
                        list: event.detail.orderline.combolines,
                    }
                );
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
            async _editPackLotLines(event) {
                var self = this;
                if(this.env.pos.config.enable_pos_serial){
                    const orderline = event.detail.orderline;
                    const isAllowOnlyOneLot = orderline.product.isAllowOnlyOneLot();
                    const packLotLinesToEdit = orderline.getPackLotLinesToEdit(isAllowOnlyOneLot);
                    var product_id = orderline.product
                    var picking_type = this.env.pos.config.picking_type_id[0]
                    var params = {
                        model: 'stock.production.lot',
                        method: 'product_lot_and_serial',
                        args: [product_id, product_id.id, picking_type]
                    }
                    try {
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
                                self.showScreen('PackLotLineScreen', {isSingleItem : isAllowOnlyOneLot,
                                                                       orderline : orderline,
                                                                       serials : self.state.serials});
                            }
                        });
                    }catch (error) {
                        if (error instanceof Error) {
                            throw error;
                        } else {
                            self.env.pos.get_order().set_connected(false);
                            super._editPackLotLines(event);
                        }
                    }
                }else{
                    super._editPackLotLines(event);
                }
            }

        }

    Registries.Component.extend(OrderWidget, OrderWidgetInh);

    return OrderWidgetInh;

});
