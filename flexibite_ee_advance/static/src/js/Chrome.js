odoo.define('flexibite_ee_advance.Chrome', function(require) {
    'use strict';

    const Chrome = require('point_of_sale.Chrome');
    const Registries = require('point_of_sale.Registries');
    const { useListener } = require('web.custom_hooks');
    const { posbus } = require('point_of_sale.utils');
    const { useRef } = owl.hooks;
    const { Gui } = require('point_of_sale.Gui');
    var cross_tab = require('bus.CrossTab').prototype;
    const rpc = require('web.rpc');
    var core = require('web.core');
    var session = require('web.session');
    var framework = require('web.framework');

    const AsplRetChromeInh = (Chrome) =>
        class extends Chrome {
        constructor() {
            super(...arguments);
            useListener('click-dine-in', this._clickDineIn);
            useListener('click-take-away', this._clickTakeAway);
            useListener('click-delivery', this._clickDelivery);
            useListener('click-kitchen-screen', this._clickKitchenScreen);
            useListener('click-sync-order-screen', this._clickSyncOrderScreen);
            this.state.orderData = [];
            this.state.orderTypeList = {dineIn: '', takeAway: '', delivery: ''};
            this.state.sData = {dineIn: 0, takeAway: 0, delivery: 0}
            this.state.dineIn = true;
            this.state.takeAway = true;
            this.state.delivery = true;
        }
        get isTicketButtonShown(){
            return this.mainScreen.name !== 'KitchenScreen';
        }
        get isKitchenScreen(){
            return this.mainScreen.name === 'KitchenScreen';
        }
        get isManager(){
            return this.env.pos.user.kitchen_screen_user === 'manager';
        }
        async start() {
            await super.start();
            await this._poolData(); 
        }
        _poolData(){
            this.env.services['bus_service'].updateOption('pos.order.line',session.uid);
            this.env.services['bus_service'].onNotification(this,this._onNotification);
            this.env.services['bus_service'].startPolling();
            cross_tab._isRegistered = true;
            cross_tab._isMasterTab = true;
        }
        _onNotification(notifications) {
            var self = this;
            for (var item of notifications) {
                if(item.payload.screen_display_data){
                    if(item.payload.new_order){
                        Gui.playSound('bell');
                    }
                    let categoryList = this.env.pos.user.pos_category_ids;
                    var order_data = [];
                    var syncOrderList = [];
                    this.state.orderTypeList = {dineIn: '', takeAway: '', delivery: ''};
                    var allOrderLines = [];
                    var dineIn = 0;
                    var takeAway = 0;
                    var delivery = 0;

                    _.each(item.payload.screen_display_data, function(order){
                        if(order.state == 'draft'){
                            let clone = {...order};
                            syncOrderList.push(clone);
                        }
                        let localTime =  moment.utc(order.order_time).toDate();
                        order['order_time'] =  moment(localTime).format('HH:mm:ss');
                        var order_line_data = [];
                        _.each(order.order_lines,function(line){
                            allOrderLines[line.id] = line.state;
                            let domain = _.contains(['Done','Cancel'], line.state);
                            if(!domain && _.contains(categoryList, line.categ_id) && !item.payload.manager){
                                order_line_data.push(line);
                            }else if(!domain && item.payload.manager){
                                order_line_data.push(line);
                            }
                        });
                        order.order_lines = order_line_data;
                        order['display'] = true;
                        if(order.order_lines.length != 0){
                            order_data.push(order);
                        }
                        if(order.order_type == 'Dine In'){
                            self.state.orderTypeList.dineIn = 'Dine In';
                            dineIn += 1;
                            if(!self.state.dineIn){
                                order.display = false;
                            }
                        }else if(order.order_type == 'Take Away'){
                            self.state.orderTypeList.takeAway = 'Take Away';
                            takeAway += 1;
                            if(!self.state.takeAway){
                                order.display = false;
                            }
                        }else if(order.order_type == 'Delivery'){
                            self.state.orderTypeList.delivery = 'Delivery';
                            delivery += 1;
                            self.state.sData['delivery'] += 1;
                            if(!self.state.delivery){
                                order.display = false;
                            }
                        }
                    });
                    this.state.sData = {dineIn: dineIn, takeAway: takeAway, delivery: delivery};
                    this.state.orderData = order_data;
                    this.env.pos.set_kitchen_screen_data(syncOrderList);

                }else if(item.payload && item.payload.remove_order){
                    if(this.env.pos.get_order_list().length > 0){
                        var collection_orders = this.env.pos.get_order_list()[0].collection.models;
                        for (let i = 0; i < collection_orders.length; i++){
                            let collection_order = collection_orders[i];
                            if(item.payload.remove_order == collection_order.server_id){
                                collection_order.destroy({ reason: 'abandon' });
                                posbus.trigger('order-deleted');
                            }
                        }
                    }
                }
                if(allOrderLines){
                    self.updatePosScreenOrder(allOrderLines);
                }
            }
        }
        updatePosScreenOrder(order_line_data){
            if(this.env.pos.get_order_list().length > 0){
                var collection_orders = this.env.pos.get_order_list()[0].collection.models;
                for (let i = 0; i < collection_orders.length; i++){
                    let collectionOrder = collection_orders[i];
                    if(collectionOrder.server_id){
                        for(let line of collectionOrder.orderlines.models){
                            if(line && line.server_id && order_line_data[line.server_id]){
                                line.set_line_state(order_line_data[line.server_id]);
                            }
                        }
                    }
                }
            }
        }
        _setIdleTimer() {
            if(this.env.pos.config.enable_automatic_lock){
                var time_interval = this.env.pos.config.time_interval || 3;
                var milliseconds = time_interval * 60000
                setTimeout(() => {
                    var params = {
                        model: 'pos.session',
                        method: 'write',
                        args: [this.env.pos.pos_session.id,{'is_lock_screen' : true}],
                    }
                    rpc.query(params, {async: false}).then(function(result){})
                    $('.lock_button').css('background-color', 'rgb(233, 88, 95)');
                    $('.freeze_screen').addClass("active_state");
                    $(".unlock_button").fadeIn(2000);
                    $('.unlock_button').css('display','block');
                }, milliseconds);
            }
        }
        get startScreen() {
            if(this.env.pos.user.kitchen_screen_user === 'cook'){
                return { name: 'KitchenScreen'};
            } else{
                return super.startScreen;
            }
        }
        _clickDineIn(event){
            var self = this;
            this.state.dineIn = event.detail.dineIn;
            var order_data = []
            _.each(self.state.orderData,function(order){
                if(order.order_type == 'Dine In'){
                    if(self.state.dineIn){
                        order['display'] = true;
                    }else{
                        order['display'] = false;
                    }
                }
                order_data.push(order);
            });
            this.state.orderData = order_data;
        }
        _clickTakeAway(event){
            var self = this;
            this.state.takeAway = event.detail.takeAway;
            var order_data = []
            _.each(self.state.orderData,function(order){
                if(order.order_type == 'Take Away'){
                    if(self.state.takeAway){
                        order['display'] = true;
                    }else{
                        order['display'] = false;
                    }
                }
                order_data.push(order);
            });
            this.state.orderData = order_data;
        }
        _clickDelivery(event){
            var self = this;
            this.state.delivery = event.detail.delivery;
            var order_data = []
            _.each(self.state.orderData,function(order){
                if(order.order_type == 'Delivery'){
                    if(self.state.delivery){
                        order['display'] = true;
                    }else{
                        order['display'] = false;
                    }
                }
                order_data.push(order);
            });
            this.state.orderData = order_data;
        }
        async _closePos() {
            if(this.env.pos.user.kitchen_screen_user === 'cook'){
                this.state.uiState = 'CLOSING';
                this.loading.skipButtonIsShown = false;
                this.setLoadingMessage(this.env._t('Closing ...'));
                window.location = '/web/session/logout';
            } else{
                await super._closePos();
            }
        }
        openCashControl() {
            if (!this.env.pos.config.enable_close_session) {
                if (this.shouldShowCashControl()) {
                    this.showPopup('CashOpeningPopup', { notEscapable: true });
                }
            }
        }
        _clickSyncOrderScreen(){
            this.showScreen('SyncOrderScreen');
        }
        _clickKitchenScreen(){
            if(this.mainScreen.name === 'KitchenScreen'){
                this.showScreen('ProductScreen');
            }else{
                this.showScreen('KitchenScreen');
            }
        }
    };


    Registries.Component.extend(Chrome, AsplRetChromeInh);

    return Chrome;
});
