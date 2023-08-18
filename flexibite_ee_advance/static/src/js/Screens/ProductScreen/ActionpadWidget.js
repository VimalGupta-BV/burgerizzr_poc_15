odoo.define('flexibite_ee_advance.ActionpadWidget', function(require) {
    'use strict';

    const ActionpadWidget = require('point_of_sale.ActionpadWidget');
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const { useListener } = require('web.custom_hooks');
    const { useState } = owl.hooks;

    const AsplResActionpadWidget = (ActionpadWidget) =>
        class extends ActionpadWidget {
            constructor() {
                super(...arguments);
                useListener('click-send-to-kitchen', this._clickSendToKitchen);
            }
            async _clickSendToKitchen(){
                var selectedOrder = this.env.pos.get_order();
                selectedOrder.initialize_validation_date();
                if(selectedOrder.is_empty()){
                    this.showNotification('Please select product!!');
                }else{
                    try{
                        selectedOrder.set_send_to_kitchen(true);
                        this.env.pos.get_order().set_delete_product(false)
                        const orderLinesState = _.pluck(selectedOrder.orderlines.models, 'state');
                        let orderState;
                        if(orderLinesState.includes('Waiting')){
                            orderState = 'Start';
                        }else if(orderLinesState.includes('Preparing')){
                            orderState = 'Done';
                        }else if(orderLinesState.includes('Delivering')){
                            orderState = 'Deliver';
                        }else if(orderLinesState.includes('Done')){
                            orderState = 'Complete';
                        }
                        selectedOrder.set_order_state(orderState)
                        var orderId = await this.env.pos.push_orders(selectedOrder, {'draft':true});
                        selectedOrder.set_server_id(orderId[0]);
                        let orderLineIds = await this.orderLineIds(orderId[0]);
                        for(var line of selectedOrder.get_orderlines()){
                            for(var lineID of orderLineIds){
                                if(line.cid === lineID.line_cid || line.server_id == lineID.server_id){
                                    line.set_server_id(lineID.id);
                                    line.set_line_state(lineID.state);
                                }
                            }
                        }
                    } catch(ex){
                        console.warn('Order Not Send, Please check your network connection!');
                    }
                }
            }
            orderLineIds(orderId){
                return this.rpc({
                    model: 'pos.order.line',
                    method: 'search_read',
                    fields: ['line_cid', 'state'],
                    domain: [['order_id', '=', orderId]]
                })
            }
            get isKitchenButton(){
                return ['manager', 'waiter'].includes(this.env.pos.user.kitchen_screen_user)  &&
                   this.env.pos.config.restaurant_mode == 'full_service';
            }
        };

    Registries.Component.extend(ActionpadWidget, AsplResActionpadWidget);

    return ActionpadWidget;
});



