odoo.define('flexibite_ee_advance.models', function (require) {
    "use strict";

    var models = require('point_of_sale.models');
    var core = require('web.core');
    var rpc = require('web.rpc');
    var _t = core._t;
    var _ModelProto = models.Order.prototype;
    var utils = require('web.utils');
    var session = require('web.session');
    var exports = {};
    var round_pr = utils.round_precision;
    var round_di = utils.round_decimals;
    var field_utils = require('web.field_utils');

    models.load_fields("pos.payment.method", ['jr_use_for']);
    models.load_fields("res.partner", ['remaining_wallet_amount']);
    models.load_fields("res.users", ['image_1920', 'display_amount_during_close_session','pin', 'write_date',
                    'access_money_in_out', 'access_wallet', 'access_gift_card', 'access_default_customer',
                    'access_gift_voucher', 'access_warehouse_qty', 'access_bag_charges', 'access_multi_uom',
                    'access_pos_lock', 'access_purchase_history', 'access_vertical_category', 'access_pos_return',
                    'access_close_session', 'access_signature',
                    'access_product_summary', 'access_order_summary', 'access_payment_summary', 'access_audit_report',
                    'access_purchase_order', 'access_pos_order_note', 'barcode',
                    'access_delivery_charges','kitchen_screen_user','pos_category_ids','is_delete_order_line',
                    'delete_order_line_reason']);
    models.load_fields("product.product", ['is_packaging', 'type', 'qty_available', 'is_combo','product_combo_ids']);
    models.load_fields('pos.session',['is_lock_screen']);
    models.load_fields('pos.order',['note']);
    models.load_fields('pos.order.line',['line_note','bom_id']);

    var _super_paymentline = models.Paymentline.prototype;
    var _super_Order = models.Order.prototype;
    /*LOAD REQUIRE MODELS START*/
    models.PosModel.prototype.models.push({
        model:  'aspl.gift.card.type',
        fields: ['name'],
        loaded: function(self,card_type){
            self.card_type = card_type;
        },
    },{
        model: 'aspl.gift.card',
        domain: [['is_active', '=', true]],
        loaded: function(self,gift_cards){
            self.db.add_giftcard(gift_cards);
            self.set({'gift_card_order_list' : gift_cards});
        },
    },{
        model: 'aspl.gift.voucher',
        domain: [['is_active', '=', true]],
        fields: ['id', 'voucher_name', 'voucher_amount', 'minimum_purchase', 'expiry_date','redemption_order', 'redemption_customer', 'voucher_code'],
        loaded: function(self,gift_voucher){
            self.gift_vouchers = gift_voucher;
        },
    },{
        model:  'stock.picking.type',
        fields: [],
        domain: [['code','=','internal']],
        loaded: function(self,stock_pick_typ){
            self.stock_pick_typ = stock_pick_typ;
            // self.db.add_picking_types(stock_pick_typ);
        },
    },{
        model:  'stock.location',
        fields: ['complete_name', 'name'],
        domain: [['usage','=','internal']],
        loaded: function(self,stock_location){
            self.stock_location = stock_location;
        },
    },{
        model:  'remove.product.reason',
        fields: ['name', 'description'],
        loaded: function(self,remove_product_reason){
            self.remove_product_reason = remove_product_reason;
        },
    },{
        model:  'pos.order',
        fields: ['id'],
        domain: function (self) {
            return [['state', '=', 'draft']];
        },
        loaded: function(self, orders){
            self.draft_order_ids = _.pluck(orders, 'id');
        },
    },{
        model:  'order.type',
        loaded: function(self,order_type){
            self.order_type = order_type;
            self.order_type_data = {};
            _.each(order_type,function(line){
                self.order_type_data[line.id] = [line.type,line.color]
            });
        },
    },{
        model:  'pos.delivery.service',
        loaded: function(self,delivery_service){
            self.delivery_service = delivery_service;
        },
    },{
        model:  'product.combo',
        loaded: function(self,product_combo){
            self.product_combo = product_combo;
            self.combo_line_data = {};
            _.each(product_combo,function(line){
                self.combo_line_data[line.id] = [line.id, line.product_ids, line.require, line.no_of_items, line.display_name, line.product_tmpl_id, line.pos_category_id, line.replaceable, line.base_price]
            });
            self.db.add_combo_line(self.combo_line_data);
        },
    });
    /*LOAD REQUIRE MODELS START*/
    var _super_posmodel = models.PosModel;
    models.PosModel = models.PosModel.extend({
        initialize: function(attr, options) {
            _super_posmodel.prototype.initialize.call(this,attr,options);
            this.kitchenScreenData = [];
        },
        set_kitchen_screen_data: function(data){
            this.kitchenScreenData = data;
            this.trigger('change',this);
        },
        get_kitchen_screen_data: function(){
            return this.kitchenScreenData;
        },
        load_server_data: function(){
            var self = this;
            var loaded = _super_posmodel.prototype.load_server_data.call(this);
            loaded.then(function(){
                var session_params = {
                    model: 'pos.session',
                    method: 'search_read',
                    domain: [['state','=','opened']],
                    fields: ['id','name','config_id'],
                    orderBy: [{ name: 'id', asc: true}],
                }
                rpc.query(session_params, {async: false})
                .then(function(sessions){
                    if(sessions && sessions[0]){
                        self.all_pos_session = sessions;
                    }
                });
                var stock_location_params = {
                    model: 'stock.location',
                    method: 'search_read',
                    domain: [['usage','=','internal'],['company_id','=',self.company.id]],
                    fields: ['id','name','company_id','complete_name'],
                }
                rpc.query(stock_location_params, {async: false})
                .then(function(locations){
                    if(locations && locations[0]){
                        self.all_locations = locations;
                    }
                });
                // var params = {
                //     model: 'res.config.settings',
                //     method: 'load_loyalty_config_settings',
                // }
                // rpc.query(params)
                // .then(function(loyalty_config){
                //     if(loyalty_config && loyalty_config[0]){
                //         self.loyalty_config = loyalty_config[0];
                //     }
                // }).catch(function(){
                //     console.log("Connection lost");
                // });
                rpc.query({
                    model: 'pos.order',
                    method: 'broadcast_order_data',
                    args: [false],
                }).then(function (records) {
                    var kitchenScreenData = [];
                    for(var ord of records){
                        if(ord.state == 'draft'){
                            kitchenScreenData.push(ord)
                        }
                    }
                    self.kitchenScreenData = kitchenScreenData;
                });
            })
            return loaded
        },
        set_kitchen_screen_data: function(data){
            this.kitchenScreenData = data;
            this.trigger('change',this);
        },
        get_kitchen_screen_data: function(){
            return this.kitchenScreenData;
        },
     });

    /*PAYMENT MODULE CUSTOM CODE START*/
    models.Paymentline = models.Paymentline.extend({
        initialize: function(attributes, options) {
           var self = this;
           _super_paymentline.initialize.apply(this, arguments);
        },
        set_giftcard_line_code: function(gift_card_code) {
            this.gift_card_code = gift_card_code;
        },
        get_giftcard_line_code: function(){
            return this.gift_card_code;
        },
    });
    /*PAYMENT MODULE CUSTOM CODE END*/

    /*SALE ORDER LINE MODEL CUSTOM CODE END*/
    var SuperOrderLine = models.Orderline.prototype;

    models.Orderline = models.Orderline.extend({
        initialize: function(attr,options){
            SuperOrderLine.initialize.call(this, attr, options);
            this.uom_id = this.product.uom_id;
            this.serials = this.serials || null;
            this.note = this.note || "";
            this.state = this.state || 'Waiting';
            this.server_id = this.server_id || false;
            this.line_cid = this.cid || false;
            this.is_in_kitchen = this.is_in_kitchen || false;
            this.bom_id = this.bom_id || false;
            this.quantityLine = {};
            this.useQuantityLine = {};
            this.combolines = this.combolines || [];
        },
        clone: function(){
            var orderLine = SuperOrderLine.clone.call(this);
            orderLine.note = this.note;
            orderLine.state = this.state;
            orderLine.server_id = this.server_id;
            orderLine.line_cid = this.line_cid;
            orderLine.is_in_kitchen = this.is_in_kitchen;
            orderLine.bom_id=this.bom_id;
            orderLine.useQuantityLine = this.useQuantityLine;
            orderLine.quantityLine = this.quantityLine;
            return orderLine;
        },
        can_be_merged_with: function(orderline) {
            if (this.state != orderline.state && !orderline.is_in_kitchen){
                return false
            }else{
                return SuperOrderLine.can_be_merged_with.apply(this,arguments);
            }
        },
        /*COMBO SCREEN CODE START*/
        set_combolines: function(combolines){
            if(combolines.length != 0){
                for(var i = 0; i < combolines.length; i++){
                    this.combolines.push(combolines[i].clone())
                }
            }else{
                this.combolines = [];
            }
        },
        get_combolines: function(){
            return this.combolines;
        },
        set_server_id: function(server_id){
            this.server_id = server_id;
        },
        get_server_id: function(server_id){
            return this.server_id;
        },
        init_from_JSON: function(json){
            SuperOrderLine.init_from_JSON.apply(this,arguments);
            this.uom_id = json.uom_id;
            this.serials = json.serials;
            this.note = json.note;
            this.bom_id=json.bom_id;
            /*KITCHEN SCREEN CODE START STAT*/
            this.server_id = json.server_id;
            this.line_cid = json.line_cid;
            this.state = json.state;
        },
        export_as_JSON: function(){
            var json = SuperOrderLine.export_as_JSON.call(this);
            json.uom_id = this.uom_id;
            json.unit_id = this.uom_id;
            json.bom_id=this.bom_id;
            json.serials = this.serials;
            json.note = this.get_product_note();
            json.order_return_qty = this.get_quantity();
            json.return_pack_lot_ids = json.pack_lot_ids;
            json.unit_id = this.product.uom_id;

            var comboLines = [];
            for(let i = 0; i < this.combolines.length; i++){
                comboLines.push(this.combolines[i].export_as_JSON());
            }
            json.quantityLine = this.quantityLine;
            json.useQuantityLine = this.useQuantityLine;
            json.combolines = comboLines;
            json.state = this.get_line_state();
            json.server_id = this.server_id;
            return json;
        },
        /*COMBO SCREEN CODE END*/
        set_line_state:function(state){
            this.state = state;
            this.trigger('change',this);
        },
        get_line_state:function(){
            return this.state;
        },
        set_product_note: function(note){
            this.note = note;
            this.trigger('change',this);
        },
        get_product_note: function(){
            return this.note;
        },
        set_serials: function(serials){
            this.serials = serials;
            this.trigger('change',this);
        },
        get_serials: function(){
            return this.serials;
        },
        set_custom_uom_id: function(uom_id){
            this.uom_id = uom_id;
            this.trigger('change',this);
        },
        get_custom_uom_id: function(){
            return this.uom_id;
        },
        set_product_lot: function(product){
            this.has_product_lot = product.tracking !== 'none';
            this.pack_lot_lines  = this.has_product_lot && new PacklotlineCollection(null, {'order_line': this});
        },
        export_for_printing: function(){
            var orderline = SuperOrderLine.export_for_printing.call(this);
            var serials = "";
            var comboLines = [];
            if(this.pack_lot_lines && this.pack_lot_lines.models){
                _.each(this.pack_lot_lines.models,function(lot) {
                    if(lot && lot.get('lot_name')){
                        serials += lot.get('lot_name')+", ";
                    }
                });
            }
            orderline.serial_names = serials ? 'Serial No(s) :' + serials : false;
            orderline.line_note = this.get_product_note();
            for(let i = 0; i < this.combolines.length; i++){
                comboLines.push(this.combolines[i].export_for_printing());
            }
            orderline['combolines'] = comboLines;
            return orderline;
        },
        set_combolines: function(combolines){
            if(combolines.length != 0){
                for(var i = 0; i < combolines.length; i++){
                    this.combolines.push(combolines[i].clone())
                }
            }else{
                this.combolines = [];
            }
        },
        get_combolines: function(){
            return this.combolines;
        },
        set_quantityLine: function(value){
            this.quantityLine = JSON.parse(JSON.stringify(value));
        },
        get_quantityLine: function(){
            return this.quantityLine;
        },
        set_useQuantityLine: function(value){
            this.useQuantityLine = JSON.parse(JSON.stringify(value));
        },
        get_useQuantityLine: function(){
            return this.useQuantityLine;
        },
        get_unit: function(){
            var res = SuperOrderLine.get_unit.call(this);
            var unit_id = this.uom_id;
            if(!unit_id){
                return res;
            }
            unit_id = unit_id[0] || unit_id;
            if(!this.pos){
                return undefined;
            }
            return this.pos.units_by_id[unit_id];
        },
        apply_uom: function(){
            var self = this;
            var orderline = self.pos.get_order().get_selected_orderline();
            var uom_id = orderline.get_custom_uom_id();
            if(uom_id){
                var selected_uom = this.pos.units_by_id[uom_id];
                orderline.uom_id = [uom_id, selected_uom.name];
                var latest_price = orderline.get_latest_price(selected_uom, orderline.product);
                orderline.set_unit_price(latest_price);
                return true
            } else{
                return false
            }
        },
        get_units_by_category: function(uom_list, categ_id){
            var uom_by_categ = []
            for (var uom in uom_list){
                if(uom_list[uom].category_id[0] == categ_id[0]){
                    uom_by_categ.push(uom_list[uom]);
                }
            }
            return uom_by_categ;
        },
        find_reference_unit_price: function(product, product_uom){
            return product.lst_price;
        },
        get_latest_price: function(uom, product){
            var uom_by_category = this.get_units_by_category(this.pos.units_by_id, uom.category_id);
            var product_uom = this.pos.units_by_id[product.uom_id[0]];
            var ref_price = this.find_reference_unit_price(product, product_uom);
            var ref_unit = null;
            for (var i in uom_by_category){
                if(uom_by_category[i].uom_type == 'reference'){
                    ref_unit = uom_by_category[i];
                    break;
                }
            }
            if(ref_unit){

                if(uom.uom_type == 'bigger'){
                    return (ref_price * uom.factor_inv);

                }
                else if(uom.uom_type == 'smaller'){
                    return (ref_price / uom.factor);
                }
                else if(uom.uom_type == 'reference'){
                    return ref_price;
                }
            }
            return product.price;
        },
    });

    var PacklotlineCollection = Backbone.Collection.extend({
        model: exports.Packlotline,
        initialize: function(models, options) {
            this.order_line = options.order_line;
        },
        get_valid_lots: function(){
            return this.filter(function(model){
                return model.get('lot_name');
            });
        },
        set_quantity_by_lot: function() {
            var valid_lots_quantity = this.get_valid_lots().length;
            this.order_line.set_quantity(valid_lots_quantity);
        }
    });

    var _super_Order = models.Order.prototype;
    models.Order = models.Order.extend({
        initialize: function(attributes,options){
            var self = this;
            this.quantityLine = {};
            this.useQuantityLine = {};
            options  = options || {};
            this.selected_comboline   = undefined;
            this.select_comboproduct = undefined;
            this.combolines     = new CombolineCollection();
            this.combolines.comparator = function( model ) {
              return model.categoryId, model.p_id;
            }
            this.combolines.on('change',   function(){ this.save_to_db("comboline:change"); }, this);
            this.combolines.on('add',      function(){ this.save_to_db("comboline:add"); }, this);
            this.combolines.on('remove',   function(){ this.save_to_db("comboline:remove"); }, this);
            _super_Order.initialize.apply(this, arguments);
            if(this.pos.stock_pick_typ && this.pos.stock_pick_typ[0] && this.pos.stock_pick_typ[0].default_location_src_id[0]){
                var default_src_location = this.pos.stock_location.filter((location) => location.id === this.pos.stock_pick_typ[0].default_location_src_id[0])
            }
            this.set({
                change_amount_for_wallet: 0.00,
                use_wallet: false,
                used_amount_from_wallet: 0.00,
                type_for_wallet: false,
                rounding: true,
                recharge: false,
                order_user_id:false,
                refund_ref_order:false,
            });
            // if (this.pos.config.enable_loyalty){
            //     this.set({
            //         earned_points: this.earned_points || 0.0,
            //         redeem_points: this.redeem_points || 0.0,
            //         points_amount: this.points_amount || 0.0,
            //         ref_reward: this.ref_reward || 0.0,
            //         ref_customer: this.ref_customer || false,
            //     });
            // }
            if(this.pos.config.enable_default_customer && this.pos.config.default_customer_id) {
                var default_customer = this.pos.config.default_customer_id[0];
                var set_partner = this.pos.db.get_partner_by_id(default_customer);
                if(set_partner){
                    this.set_client(set_partner);
                }
            }
            this.giftcard = [];
            this.if_gift_card = false
            this.voucher_redeem = this.voucher_redeem || false
            this.redeem = this.redeem || false;
            this.sign = this.sign || null;
            this.raw_sign = this.raw_sign || null;
            this.print_serial = false;
            this.order_note = this.order_note || '';
            this.delivery_charge_data = this.delivery_charge_data || {};
            this.connected = this.connected || true;
            this.product_location = default_src_location ? default_src_location[0] : false,
            //kitchen screen
            this.cancel_product_reason = [];
            this.delete_product = false;
            this.server_id = this.server_id || false;
            this.waiter_id = this.waiter_id || false;
            this.send_to_kitchen = false;
            this.order_state = this.order_state || 'Start';
            this.is_from_sync_screen = this.is_from_sync_screen || false;
            this.order_type = this.order_type || this.pos.config.default_type_id[1] || false;
            this.delivery_service = this.delivery_service || false;
            this.quantityLine = {};
            this.useQuantityLine = {};
            /*KITCHEN SCREEN CODE*/
            this.send_to_kitchen = this.send_to_kitchen || false;
            this.server_id = this.server_id || false;
            this.order_state = this.order_state || 'Start';
        },
        set_order_state: function(state){
            this.order_state = state;
            this.trigger('change',this);
        },
        get_order_state: function(){
            return this.order_state;
        },
        set_send_to_kitchen: function(flag){
            this.send_to_kitchen = flag;
            this.trigger('change',this);
        },
        get_send_to_kitchen: function(){
            return this.send_to_kitchen;
        },
        set_server_id: function(server_id){
            this.server_id = server_id;
        },
        get_server_id: function(server_id){
            return this.server_id;
        },
        set_order_status: function(status){
            this.order_state = status;
        },
        get_order_status: function(){
            return this.order_state;
        },
        get_comboline_by_server_id: function(id){
            var combolines = this.combolines.models;
            for(var i = 0; i < combolines.length; i++){
                if(combolines[i].combo_line === id){
                    return combolines[i];
                }
            }
            return null;
        },
        mirror_image_data:function(neworder){
            var self = this;
            var client_name = false;
            var order_total = self.get_total_with_tax();
            var change_amount = self.get_change();
            var payment_info = [];
            var paymentlines = self.paymentlines.models;
            if(paymentlines && paymentlines[0]){
                paymentlines.map(function(paymentline){
                    payment_info.push({
                        'name':paymentline.name,
                        'amount':paymentline.amount,
                    });
                });
            }
            var orderLines = [];
            this.orderlines.each(_.bind( function(item) {
                return orderLines.push(item.export_as_JSON());
            }, this));
            if(self.get_client()){
                client_name = self.get_client().name;
            }
            const total = this.get_total_with_tax() || 0;
            const tax = total - this.get_total_without_tax() || 0;
            var vals = {
                'orderLines': orderLines,
                'total': total,
                'tax': tax,
                'client_name':client_name,
                'order_total':order_total,
                'change_amount':change_amount,
                'payment_info':payment_info,
                'enable_customer_rating':self.pos.config.enable_customer_rating,
                'set_customer':self.pos.config.set_customer,
                'order_note': self.order_note,
            }
            if(neworder){
                vals['new_order'] = true;
            }
            rpc.query({
                model: 'customer.display',
                method: 'broadcast_data',
                args: [vals],
            })
            .then(function(result) {});
        },
        set_order_type: function(order_type){
            this.order_type = order_type;
            this.trigger('change', this);
        },
        get_order_type: function(order_type){
            return this.order_type;
        },
        set_delivery_service: function(delivery_service){
            this.delivery_service = delivery_service;
        },

        
        get_delivery_service: function(){
            return this.delivery_service;
        },
        set_waiter_id : function(waiter){
            this.waiter_id = waiter;
            this.trigger('change', this);
        },
        get_waiter_id : function(waiter){
            return this.waiter_id;
        },
        set_cancel_product_reason:function(cancel_product_reason){
            this.cancel_product_reason = cancel_product_reason;
            this.trigger('change',this);
        },
        get_cancel_product_reason:function(){
            return this.cancel_product_reason;
        },
        set_delete_product:function(delete_product){
            this.delete_product = delete_product;
            this.trigger('change',this);
        },
        get_delete_product:function(){
            return this.delete_product;
        },
        set_is_from_sync_screen: function(flag){
            this.is_from_sync_screen = flag;
            this.trigger('change',this);
        },
        get_is_from_sync_screen: function(){
            return this.is_from_sync_screen;
        },
        set_product_location: function(product_location) {
            this.product_location = product_location
            // this.mirror_image_data();
        },
        get_product_location: function() {
            return this.product_location;
        },
        set_client: function(client){
            _ModelProto.set_client.apply(this, arguments);
            if(this.pos.config.customer_display){
                this.mirror_image_data();
            }
        },
        set_connected: function(connected) {
            this.connected = connected
        },
        get_connected: function() {
            return this.connected;
        },
        get_number_of_print : function(){
            return this.number_of_print;
        },
        set_number_of_print : function(number){
            this.number_of_print = number;
        },
        set_rating: function(rating){
            this.rating = rating;
        },
        get_rating: function(){
            return this.rating;
        },
        set_order_summary_report_mode: function(order_summary_report_mode) {
            this.order_summary_report_mode = order_summary_report_mode;
        },
        get_order_summary_report_mode: function() {
            return this.order_summary_report_mode;
        },
        set_product_summary_report :function(product_summary_report) {
            this.product_summary_report = product_summary_report;
        },
        get_product_summary_report: function() {
            return this.product_summary_report;
        },
        set_sales_summary_mode: function(sales_summary_mode) {
            this.sales_summary_mode = sales_summary_mode;
        },
        get_sales_summary_mode: function() {
            return this.sales_summary_mode;
        },
        set_sales_summary_val :function(sales_summary_val) {
            this.sales_summary_val = sales_summary_val;
        },
        get_sales_summary_val: function() {
            return this.sales_summary_val;
        },
        set_receipt: function(custom_receipt) {
            this.custom_receipt = custom_receipt;
        },
        get_receipt: function() {
            return this.custom_receipt;
        },
        set_order_list: function(order_list) {
            this.order_list = order_list;
        },
        get_order_list: function() {
            return this.order_list;
        },
        set_sign: function(sign) {
            this.sign = sign;
            this.trigger('change',this);
        },
        get_sign: function(){
            return this.sign;
        },
        set_raw_sign : function(sign){
            this.raw_sign = sign;
            this.trigger('change',this);
        },
        get_raw_sign : function(){
            return this.raw_sign;
        },
        set_refund_ref_order: function(refund_ref_order) {
            this.set('refund_ref_order', refund_ref_order);
        },
        get_refund_ref_order: function() {
            return this.get('refund_ref_order');
        },
        set_refund_order: function(refund_order){
            this.refund_order = refund_order;
            this.trigger('change',this);
        },
        get_refund_order: function(){
            return this.refund_order;
        },
        set_type_for_wallet: function(type_for_wallet) {
            this.set('type_for_wallet', type_for_wallet);
        },
        get_type_for_wallet: function() {
            return this.get('type_for_wallet');
        },
        set_is_rounding: function(rounding) {
            this.set('rounding', rounding);
        },
        get_is_rounding: function() {
            return this.get('rounding');
        },
        set_change_amount_for_wallet: function(change_amount_for_wallet) {
            this.set('change_amount_for_wallet', change_amount_for_wallet);
        },
        get_change_amount_for_wallet: function() {
            return this.get('change_amount_for_wallet');
        },
        set_used_amount_from_wallet: function(used_amount_from_wallet) {
            this.set('used_amount_from_wallet', used_amount_from_wallet);
        },
        getNetTotalTaxIncluded: function() {
            var total = this.get_total_with_tax();
            return total;
        },
        get_used_amount_from_wallet: function() {
            return this.get('used_amount_from_wallet');
        },
        /*GIFT CARD CODE START*/
        set_giftcard: function(giftcard) {
            this.giftcard.push(giftcard);
        },
        get_giftcard: function() {
            return this.giftcard;
        },
        set_recharge_giftcard: function(recharge) {
            this.set('recharge', recharge);
        },
        get_recharge_giftcard: function(){
            return this.get('recharge');
        },
        set_redeem_giftcard: function(redeem){
            this.redeem = redeem;
            this.trigger('change',this);
        },
        get_redeem_giftcard: function(){
            return this.redeem;
        },
        set_redeem_giftvoucher: function(voucher_redeem){
            this.voucher_redeem = voucher_redeem;
            this.trigger('change',this);
        },
        get_redeem_giftvoucher: function(){
            return this.voucher_redeem;
        },
        // set_earned_reward : function(earned_points){
        //     this.set('earned_points', earned_points);
        // },

        // get_earned_reward : function(earned_points){
        //     return this.get('earned_points');
        // },
        // set_used_points_from_loyalty: function(redeem_points) {
        //     this.set('redeem_points', redeem_points);
        // },
        // get_used_points_from_loyalty: function(redeem_points) {
        //     return this.get('redeem_points');
        // },
        // set_used_points_amount: function(points_amount) {
        //     this.set('points_amount', points_amount);
        // },
        // get_used_points_amount: function(points_amount) {
        //     return this.get('points_amount');
        // },
        // set_reference_reward:function(ref_reward){
        //     this.set('ref_reward', ref_reward);
        // },
        // get_reference_reward:function(ref_reward){
        //     return this.get('ref_reward');
        // },
        // set_reference_customer:function(ref_customer){
        //     this.set('ref_customer', ref_customer);
        // },
        // get_reference_customer:function(ref_customer){
        //     return this.get('ref_customer');
        // },
        // set_ref_client: function(ref){
        //     this.assert_editable();
        //     this.set('ref',ref);
        // },
        // get_ref_client: function(){
        //     return this.get('ref');
        // },
        // set_referral_event_type : function(referral_event){
        //     this.set('referral_event', referral_event);
        // },
        // get_referral_event_type : function(referral_event){
        //     return this.get('referral_event');
        //     return this.referral_event;
        // },
        // order_sync
        set_salesman_id: function(salesman_id){
            this.set('salesman_id',salesman_id);
        },
        get_salesman_id: function(){
            return this.get('salesman_id');
        },
        set_is_modified_order:function(flag){
            this.set('flag', flag);
        },
        get_is_modified_order:function(){
            return this.get('flag');
        },
        set_pos_reference: function(pos_reference) {
            this.set('pos_reference', pos_reference)
        },
        get_pos_reference: function() {
            return this.get('pos_reference')
        },
        set_order_id: function(order_id){
            this.set('order_id', order_id);
        },
        get_order_id: function(){
            return this.get('order_id');
        },
        set_sequence:function(sequence){
            this.set('sequence',sequence);
        },
        get_sequence:function(){
            return this.get('sequence');
        },
        set_journal: function(statement_ids) {
            this.set('paymentlines', statement_ids)
        },
        get_journal: function() {
            return this.get('paymentlines');
        },
        set_amount_return: function(amount_return) {
            this.set('amount_return', amount_return);
        },
        get_amount_return: function() {
            return this.get('amount_return');
        },
        set_date_order: function(date_order) {
            this.set('date_order', date_order);
        },
        get_date_order: function() {
            return this.get('date_order');
        },

        set_delivery_charge: function(charge) {
            var dilevery_product = this.pos.db.get_product_by_id(this.pos.config.delivery_product_id[0]);
            var lines = this.get_orderlines();
            if (dilevery_product) {
                for (var i = 0; i < lines.length; i++) {
                    if (lines[i].get_product() === dilevery_product) {
                        lines[i].set_unit_price(charge);
                        lines[i].set_lst_price(charge);
                        lines[i].price_manually_set = true;
                        lines[i].order.tip_amount = charge;
                        return;
                    }
                }
                return this.add_product(dilevery_product, {
                  is_tip: true,
                  quantity: 1,
                  price: charge,
                  lst_price: charge,
                  extras: {price_manually_set: true},
                });
            }
        },
        get_delivery_charge: function() {
            var dilevery_product = this.pos.db.get_product_by_id(this.pos.config.delivery_product_id[0]);
            var lines = this.get_orderlines();
            if (!dilevery_product) {
                return 0;
            } else {
                for (var i = 0; i < lines.length; i++) {
                    if (lines[i].get_product() === dilevery_product) {
                        return {product_id: this.pos.config.delivery_product_id[0], amount: lines[i].get_unit_price()}
                    }
                }
                return 0;
            }
        },
        set_delivery_charge_data: function(delivery_charge_data){
            this.delivery_charge_data = delivery_charge_data;
        },
        get_delivery_charge_data: function(){
            return this.delivery_charge_data;
        },
        get_change: function(paymentLine) {
            if(this.get_order_id()){
                let change = 0.0;
                if (!paymentLine) {
                    if(this.get_total_paid() > 0){
                        change = this.get_total_paid() - this.get_total_with_tax();
                    }else{
                        change = this.get_amount_return();
                    }
                }else {
                    change = -this.get_total_with_tax();
                    var orderPaymentLines  = this.pos.get_order().get_paymentlines();
                    for (let i = 0; i < orderPaymentLines.length; i++) {
                        change += orderPaymentLines[i].get_amount();
                        if (orderPaymentLines[i] === paymentLine) {
                            break;
                        }
                    }
                }
                return round_pr(Math.max(0,change), this.pos.currency.rounding);
            } else {
                return _super_Order.get_change.call(this, orderPaymentLines);
            }
        },
        // rounding off for unuse product
        get_rounding_applied: function() {
            var rounding_applied = _super_Order.get_rounding_applied.call(this);
            var rounding = this.get_is_rounding();
            if(this.pos.config.cash_rounding && !rounding && rounding_applied != 0) {
                rounding_applied = 0
                return rounding_applied;
            }
            return rounding_applied;
        },
        has_not_valid_rounding: function() {
            var rounding_applied = _super_Order.has_not_valid_rounding.call(this);
            var rounding = this.get_is_rounding();
            var line_rounding = true;
            if(!this.pos.config.cash_rounding)
                return false;
            if (this.pos.config.cash_rounding && !rounding)
                return false;
            var lines = this.paymentlines.models;

            for(var i = 0; i < lines.length; i++) {
                var line = lines[i];
                if (line.payment_method.jr_use_for === 'gift_card' || line.payment_method.jr_use_for === 'wallet'){
                    line_rounding = false;
                    break
                }else{
                    line_rounding = true;
                }
            }
            if (!line_rounding){
                return false;
            }else{
                if(!utils.float_is_zero(line.amount - round_pr(line.amount, this.pos.cash_rounding[0].rounding), 6))
                return line;
            }
            return false;
        },
        set_sales_person_id: function(user_id){
            this.set('order_user_id',user_id);
        },
        get_sales_person_id: function(){
            return this.get('order_user_id');
        },
        set_order_note: function(order_note) {
            this.order_note = order_note;
            this.trigger('change',this);
        },
        get_order_note: function() {
            return this.order_note;
        },
        set_is_update_increnement_number: function (is_update_increnement_number) {
            this.is_update_increnement_number = is_update_increnement_number;
        },
        get_is_update_increnement_number: function () {
            return this.is_update_increnement_number;
        },
        set_temp_increment_number: function (temp_increment_number) {
            this.temp_increment_number = temp_increment_number;
        },
        get_temp_increment_number: function () {
            return this.temp_increment_number;
        },
        clone: function(){
            var order = _super_order.clone.apply(this);
            order.order_type = this.order_type;
            return order;
        },
        zero_pad: function (num, size) {
            var s = "" + num;
            while (s.length < size) {
                s = "0" + s;
            }
            return s;
        },
        init_from_JSON: function(json){
            _super_Order.init_from_JSON.apply(this,arguments);
            this.refund_order = json.refund_order;
            this.voucher_redeem = json.voucher_redeem;
            this.redeem = json.redeem;
            this.sign = json.sign;
            this.raw_sign = json.raw_sign;
            this.order_note = json.order_note;
            this.delivery_charge_data = json.delivery_charge_data;
            this.connected = json.connected;
            this.product_location = json.product_location;
            //kitchen screen
            this.cancel_product_reason = json.cancel_product_reason;
            this.send_to_kitchen     = json.send_to_kitchen;
            this.server_id     = json.server_id;
            this.waiter_id     = json.waiter_id;
            this.order_state     = json.order_state;
            this.is_from_sync_screen     = json.is_from_sync_screen;
            this.order_type = json.order_type
            this.delivery_service = json.delivery_service
            var orderlines = json.lines;
            this.send_to_kitchen = json.send_to_kitchen;
            this.order_state = json.order_state;
            this.order_type = json.order_type;
            this.temp_increment_number = json.temp_increment_number;
            var orderlines = json.lines;
            var orderlines_length = orderlines.length;
            this.is_from_sync_screen = json.is_from_sync_screen;
            for (var i = 0; i < orderlines_length; i++) {
                var orderline = orderlines[i][2];
                if(orderline.combo_lines){
                    var combolines = orderline.combo_lines;
                    var combolines_length = combolines.length;
                    for (var j = 0; j < combolines_length; j++) {
                        var comboline = combolines[j];
                        this.add_comboline(new exports.Comboline({}, {pos: this.pos, order: this, json: comboline}))
                    }
                    this.get_orderline_by_server_id(orderline.server_id).set_combolines(this.get_combolines());
                    this.remove_all_comboline();
                    this.get_orderline_by_server_id(orderline.server_id).set_quantityLine(orderline.quantityLine);
                    this.get_orderline_by_server_id(orderline.server_id).set_useQuantityLine(orderline.useQuantityLine);
                }
                else if(orderline.combolines){
                    var combolines = orderline.combolines;
                    var combolines_length = orderline.combolines.length;
                    for (var j = 0; j < combolines_length; j++) {
                        var comboline = combolines[j];
                        this.add_comboline(new exports.Comboline({}, {pos: this.pos, order: this, json: comboline}));
                    }
                    this.get_orderline(orderline.id).set_combolines(this.get_combolines());
                    this.remove_all_comboline();
                    this.get_orderline(orderline.id).set_quantityLine(orderline.quantityLine);
                    this.get_orderline(orderline.id).set_useQuantityLine(orderline.useQuantityLine);
                }
            }
        },
        // send detail in backend order
        export_as_JSON: function() {
            var orders = _super_Order.export_as_JSON.call(this);
            orders.wallet_type = this.get_type_for_wallet() || false;
            orders.change_amount_for_wallet = this.get_change_amount_for_wallet() || 0.00;
            orders.used_amount_from_wallet = this.get_used_amount_from_wallet() || 0.00;
            orders.amount_paid = this.get_total_paid() - (this.get_change() - Number(this.get_change_amount_for_wallet()));
            orders.amount_return = this.get_change() - Number(this.get_change_amount_for_wallet());
            orders.amount_due = this.get_due() ? (this.get_due() + Number(this.get_change_amount_for_wallet())): 0.00;
            orders.sales_person_id = this.get_sales_person_id() || false;
            // gift card
            orders.giftcard = this.get_giftcard() || false;
            orders.recharge = this.get_recharge_giftcard() || false;
            orders.redeem = this.get_redeem_giftcard() || false;
            // gift card
            orders.voucher_redeem = this.get_redeem_giftvoucher() || false;

            orders.uom_id = this.uom_id;

            orders.order_note = this.get_order_note()

            // orders.earned_points = this.get_earned_reward() || false;
            // orders.redeem_points = this.get_used_points_from_loyalty() || false;
            // orders.points_amount = this.get_used_points_amount() || false;
            // orders.ref_reward = this.get_reference_reward() || false;
            // orders.ref_customer = this.get_reference_customer() || false;
            // orders.referral_event = this.get_referral_event_type() || false;
            // orders.refund_order = this.refund_order || false;
            // orders.refund_ref_order = this.get_refund_ref_order() || false;
            // Signature
            orders.sign = this.sign || false;
            orders.raw_sign = this.raw_sign || false;
            orders.raw_sign = this.raw_sign || false;
            // $.extend(orders, new_val);
            orders.rating = this.get_rating() || 0
            orders.salesman_id = this.get_salesman_id() || this.pos.user.id;
            orders.old_order_id = this.get_order_id();
            orders.sequence = this.get_sequence();
            orders.pos_reference = this.get_pos_reference();
            orders.cashier_id = this.pos.user.id;
            orders.get_delivery_charge_data = this.get_delivery_charge_data() || false;
            orders.get_delivery_charge = this.get_delivery_charge() || false;
            orders.product_location = this.get_product_location() || 0;
            //kitchen screen
            orders.cancel_product_reason = this.get_cancel_product_reason();
            orders.delete_product = this.get_delete_product();
            orders.send_to_kitchen = this.send_to_kitchen || false;
            orders.server_id = this.server_id;
            orders.waiter_id = this.waiter_id;
            orders.order_state = this.order_state;
            orders.is_from_sync_screen = this.is_from_sync_screen;
            orders.order_type = this.order_type;
            orders.delivery_service = this.delivery_service;
            orders.send_to_kitchen = this.get_send_to_kitchen() ? this.send_to_kitchen : false;
            orders.order_state = this.order_state;
            return orders;
        },
        // send detail in report
        export_for_printing: function(){
            var orders = _super_Order.export_for_printing.call(this);
            orders.change_amount_for_wallet= this.get_change_amount_for_wallet() || false;
            orders.used_amount_from_wallet= this.get_used_amount_from_wallet() || false;
            orders.amount_paid= this.get_total_paid() - (this.get_change() - Number(this.get_change_amount_for_wallet()));
            orders.amount_return= this.get_change() - Number(this.get_change_amount_for_wallet());
            //Reservation
            orders.amount_due= this.get_due() ? (this.get_due() + Number(this.get_change_amount_for_wallet())): 0.00;
            orders.change = this.locked ? this.amount_return- Number(this.get_change_amount_for_wallet()) : this.get_change() - Number(this.get_change_amount_for_wallet());
            // gift card
            orders.giftcard = this.get_giftcard() || false;
            orders.recharge = this.get_recharge_giftcard() || false;
            orders.redeem = this.get_redeem_giftcard() || false;
            // gift card
            // orders.earned_points= this.get_earned_reward() || false;
            // orders.redeem_points= this.get_used_points_from_loyalty() || false;
            // $.extend(orders, new_val);
            orders.order_note = this.get_order_note();
            return orders;
        },
        get_orderline_by_server_id: function(id){
            var orderlines = this.orderlines.models;
            for(var i = 0; i < orderlines.length; i++){
                if(orderlines[i].server_id === id){
                    return orderlines[i];
                }
            }
            return null;
        },
        get_comboline_by_server_id: function(id){
            var combolines = this.combolines.models;
            for(var i = 0; i < combolines.length; i++){
                if(combolines[i].combo_line === id){
                    return combolines[i];
                }
            }
            return null;
        },
        add_product: function(product, options){
            var self = this;
             _super_Order.add_product.call(this,product, options);
            var line = this.get_selected_orderline()
            if(self.pos.config.customer_display){
                self.mirror_image_data();
            }
            if (options.combolines !== undefined){
                line.set_combolines(options.combolines);
            }
            if(options.quantity !== undefined){
                line.set_quantity(options.quantity);
            }
        },
        remove_all_comboline: function(){
            var self = this;
            var lines = this.get_combolines();
            _.each(lines, function (line) {
                self.remove_comboline(self.get_last_comboline());
            });
        },
        set_select_comboproduct: function(line){
            if(line){
                this.select_comboproduct = line;
            }else{
                this.select_comboproduct = undefined;
            }
        },
        get_select_comboproduct: function(){
            return this.select_comboproduct;
        },
        get_combo_products: function(){
            var combolines = this.combolines.models;
            var list = [];
            let length = combolines.length;
            let i = 0;
            for(i; i < length; i++){
                list.push(combolines[i].product);
            }
            return list;
        },
        add_combo_product: function(product, options){
            options = options || {};
            var attr = JSON.parse(JSON.stringify(product));
            attr.pos = this.pos;
            attr.order = this;
            var line = new exports.Comboline({}, {pos: this.pos, order: this, product: product});

            if(options.categoryId !== undefined){
                line.set_categoryId(options.categoryId);
            }
            if(options.require !== undefined){
                line.set_require(options.require);
            }
            if(options.categoryName !== undefined){
                line.set_categoryName(options.categoryName);
            }
            if(options.replaceable !== undefined){
                line.set_replaceable(options.replaceable);
            }
            if(options.basePrice !== undefined){
                line.set_basePrice(options.basePrice);
            }
            if(options.quantity !== undefined){
                line.set_quantity(options.quantity);
            }
            if(options.max !== undefined){
                line.set_max(options.max);
            }
            if(options.is_replaced !== undefined){
                line.set_is_replaced(options.is_replaced);
            }
            if(options.replaced_product_id !== undefined){
                line.set_replaced_product_id(options.replaced_product_id);
            }
            if (options.replacePrice !== undefined){
                line.set_replacePrice(options.replacePrice);
            }
            if (options.customisePrice !== undefined){
                line.set_customisePrice(options.customisePrice);
            }
            var to_merge_comboline;
            let length = this.combolines.length;
            let i = 0;
            for (i; i < length; i++) {
                if(this.combolines.at(i).can_be_merged_with(line) && options.merge !== false){
                    to_merge_comboline = this.combolines.at(i);
                }
            }
            if (to_merge_comboline){
                to_merge_comboline.merge(line);
                this.select_comboline(to_merge_comboline);
            } else {
                this.combolines.add(line);
                this.select_comboline(line);
            }
        },
        add_comboline: function(line){
            this.combolines.add(line);
            this.select_comboline(this.get_last_comboline());
        },
        //improve get_comboline because there is duplicate line present
        get_comboline: function(c_id,p_id){
            let i = 0;
            var combolines = this.combolines.models;
            let length = combolines.length;
            for(i ; i < length; i++){
                if(combolines[i].categoryId == c_id && combolines[i].p_id == p_id){
                    return combolines[i];
                }
            }
            return null;
        },
        get_remaining_comboline: function(line){
            var combolines = this.combolines.models;
            var list = [];
            let length = combolines.length;
            let i = 0;
            for(i; i < length; i++){
                if(combolines[i].categoryId == line.categoryId && combolines[i].p_id == line.p_id && combolines[i].cid != line.cid){
                    list.push(combolines[i]);
                }
            }
            return list;
        },
        get_combolines: function(){
            return this.combolines.models;
        },
        get_selected_comboline: function(){
            return this.selected_comboline;
        },
        get_last_comboline: function(){
            return this.combolines.at(this.combolines.length -1);
        },
        remove_comboline: function( line ){
            this.combolines.remove(line);
            this.select_comboline(this.get_last_comboline());
        },
        select_comboline: function(line){
            if(line){
                if(line !== this.selected_comboline){
                    if(this.selected_comboline){
                        this.selected_comboline.set_selected(false);
                    }
                    this.selected_comboline = line;
                    this.selected_comboline.set_selected(true);
                }
            }else{
                this.selected_comboline = undefined;
            }
        },
        deselect_comboline: function(){
            if(this.selected_comboline){
                this.selected_comboline.set_selected(false);
                this.selected_comboline = undefined;
            }
        },
        get_last_comboline: function(){
            return this.combolines.at(this.combolines.length -1);
        },
        get_replace_price_difference(difference){
            var rounding = this.pos.currency.rounding;
            return round_pr(difference, rounding);
        },
        c_get_total_without_tax: function() {
            return round_pr(this.combolines.reduce((function(sum, comboline) {
                return sum + comboline.get_base_price();
            }), 0), this.pos.currency.rounding);
        },
        set_quantityLine: function(value){
            this.quantityLine = JSON.parse(JSON.stringify(value));
        },
        get_quantityLine: function(){
            return this.quantityLine;
        },
        set_useQuantityLine: function(value){
            this.useQuantityLine = JSON.parse(JSON.stringify(value));
        },
        get_useQuantityLine: function(){
            return this.useQuantityLine;
        },
        set_order_type: function(order_type){
            this.order_type = order_type;
            this.trigger('change', this);
        },
        get_order_type: function(order_type){
            return this.order_type;
        },
        set_is_update_increnement_number: function (is_update_increnement_number) {
            this.is_update_increnement_number = is_update_increnement_number;
        },
        get_is_update_increnement_number: function () {
            return this.is_update_increnement_number;
        },
        set_temp_increment_number: function (temp_increment_number) {
            this.temp_increment_number = temp_increment_number;
        },
        get_temp_increment_number: function () {
            return this.temp_increment_number;
        },
        clone: function(){
            var order = _super_order.clone.apply(this);
            order.order_type = this.order_type;
            return order;
        },
        zero_pad: function (num, size) {
            var s = "" + num;
            while (s.length < size) {
                s = "0" + s;
            }
            return s;
        },
    });

    /*COMBO LINE CODE START*/
    var comboline_id = 1;
    exports.Comboline = Backbone.Model.extend({
        initialize: function(attr,options){
            this.pos   = options.pos;
            this.order = options.order;
            if (options.json) {
                try {
                    this.init_from_JSON(options.json);
                } catch(error) {
                    console.error('ERROR: attempting to recover product ID', options.json.product_id,
                        'not available in the point of sale. Correct the product or clean the browser cache.');
                }
                return;
            }
            this.combo_line = this.combo_line || false;
            this.product = options.product;
            this.selected = false;
            this.set_quantity(1);
            this.require = this.get_require();
            this.max = 0;
            this.p_id = options.product.id;
            this.categoryName = this.get_categoryName();
            this.categoryId = this.get_categoryId();
            this.replaceable = false;
            this.basePrice = 0;
            this.customisePrice = 0;
            this.replacePrice = 0;
            this.is_replaced = false;
            this.replaced_product_id = null;
            this.id = comboline_id++;
        },
        init_from_JSON: function(json) {
            this.combo_line = json.server_id,
            this.product = this.pos.db.get_product_by_id(json.product_id);
            this.set_quantity(json.qty);
            this.p_id = this.product.id,
            this.id = json.id ? json.id : comboline_id++;
//            this.bom_id = json.bom_id;
            this.categoryName = json.categoryName;
            this.categoryId = json.categoryId;
            this.replaceable = json.replaceable;
            this.basePrice = json.basePrice;
            this.replacePrice = json.replacePrice;
            this.customisePrice = json.customisePrice;
            this.require = json.require;
            this.max = json.max;
            this.is_replaced = json.is_replaced;
            this.replaced_product_id = json.replaced_product_id;
//            this.materiallines = [];
//            this.mo_id = json.mo_id;
            comboline_id = Math.max(this.id+1,comboline_id);
        },
        export_as_JSON: function() {
            return {
                combo_line: this.combo_line,
                qty: this.get_quantity(),
                product_id: this.get_product().id,
                bom_id: this.bom_id,
                id: this.id,
                categoryName: this.categoryName,
                categoryId: this.categoryId,
                replaceable: this.replaceable,
                basePrice: this.basePrice,
                replacePrice: this.replacePrice,
                customisePrice: this.customisePrice,
                require: this.require,
                max: this.max,
                is_replaced: this.is_replaced,
                replaced_product_id: this.replaced_product_id,
                full_product_name: this.get_full_product_name(),
            };
        },
        export_for_printing: function(){
            return {
                id1: this.id,
                quantity:           this.get_quantity(),
                max:                this.max,
                unit_name:          this.get_unit().name,
                price:              this.get_display_price(),
                product_name:       this.get_product().display_name,
                product_name_wrapped: this.generate_wrapped_product_name(),
                price_display :     this.get_display_price(),
                is_replaced:        this.is_replaced,
                replaced_product_name: this.get_replaced_product_name(),
            };
        },
        generate_wrapped_product_name: function() {
            var MAX_LENGTH = 30;// 40 * line ratio of .6
            var wrapped = [];
            var name = this.get_full_product_name();
            var current_line = "";

            while (name.length > 0) {
                var space_index = name.indexOf(" ");

                if (space_index === -1) {
                    space_index = name.length;
                }

                if (current_line.length + space_index > MAX_LENGTH) {
                    if (current_line.length) {
                        wrapped.push(current_line);
                    }
                    current_line = "";
                }

                current_line += name.slice(0, space_index + 1);
                name = name.slice(space_index + 1);
            }

            if (current_line.length) {
                wrapped.push(current_line);
            }

            return wrapped;
        },
        clone: function(){
            var comboline = new exports.Comboline({},{
                pos: this.pos,
                order: this.order,
                product: this.product,
            });
            comboline.combo_line = this.combo_line;
            comboline.quantity = this.quantity;
            comboline.quantityStr = this.quantityStr;
            comboline.p_id = this.p_id;
            comboline.categoryName = this.categoryName;
            comboline.categoryId = this.categoryId;
            comboline.replaceable = this.replaceable;
            comboline.basePrice = this.basePrice;
            comboline.replacePrice = this.replacePrice;
            comboline.customisePrice = this.customisePrice;
            comboline.require = this.require;
            comboline.max = this.max;
            comboline.is_replaced = this.is_replaced;
            comboline.replaced_product_id = this.replaced_product_id;
            return comboline;
        },

        can_be_merged_with: function(comboline){
            if( this.get_product().id !== comboline.get_product().id){    //only comboline of the same product can be merged
                return false;
            }else if (this.categoryId !== comboline.categoryId) {
                return false;
            }else{
                return true;
            }
        },
        merge: function(comboline){
            this.set_quantity(this.get_quantity() + comboline.get_quantity());
        },

        set_quantity: function(quantity, keep_price){
            if(quantity === 'remove'){
                this.order.remove_comboline(this);
                return;
            }else{
                var quant = parseFloat(quantity) || 0;
                var unit = this.get_unit();
                if(unit){
                    if (unit.rounding) {
                        var decimals = this.pos.dp['Product Unit of Measure'];
                        var rounding = Math.max(unit.rounding, Math.pow(10, -decimals));
                        this.quantity    = round_pr(quant, rounding);
                        this.quantityStr = field_utils.format.float(this.quantity, {digits: [69, decimals]});
                    } else {
                        this.quantity    = round_pr(quant, 1);
                        this.quantityStr = this.quantity.toFixed(0);
                    }
                }else{
                    this.quantity    = quant;
                    this.quantityStr = '' + this.quantity;
                }
            }
            this.trigger('change', this);
        },
        get_full_product_name: function () {
            var full_name = this.is_replaced ? this.get_replaced_product_name() : this.product.display_name;;
            return full_name;
        },
        set_max: function(value){
            this.max = value;
            var decimals = this.pos.dp['Product Unit of Measure'];
            this.maxStr = field_utils.format.float(this.max, {digits: [69, decimals]});
        },
        get_max: function(){
            return this.max;
        },
        get_max_str: function(){
            return this.maxStr;
        },
        set_require: function(value){
            this.require = value;
        },
        get_require: function(){
            return this.require;
        },
        set_categoryName: function(value){
            this.categoryName = value;
        },
        get_categoryName: function(){
            return this.categoryName;
        },
        set_categoryId: function(value){
            this.categoryId = value;
        },
        get_categoryId: function(){
            return this.categoryId;
        },
        set_replaceable: function(value){
            this.replaceable = value;
        },
        get_replaceable: function(){
            return this.replaceable;
        },
        set_basePrice: function(value){
            this.basePrice = value;
        },
        get_basePrice: function(){
            return this.basePrice;
        },
        set_extraPrice: function(value){
            this.extraPrice = value;
        },
        get_extraPrice: function(){
            return this.get_customisePrice() + this.get_replacePrice();
        },
        set_customisePrice: function(value){
            this.customisePrice = value;
        },
        get_customisePrice: function(){
            return this.customisePrice;
        },
        set_replacePrice: function(value){
            this.replacePrice = value;
        },
        get_replacePrice: function(){
            return this.replacePrice;
        },
        get_quantity: function(){
            return this.quantity;
        },
        get_quantity_str: function(){
            return this.quantityStr;
        },
        get_quantity_str_with_unit: function(){
            var unit = this.get_unit();
            if(unit && !unit.is_pos_groupable){
                return this.quantityStr + ' ' + unit.name;
            }else{
                return this.quantityStr;
            }
        },
        set_selected: function(selected){
            this.selected = selected;
            this.trigger('change',this);
        },
        is_selected: function(){
            return this.selected;
        },
        set_is_replaced: function(value){
            this.is_replaced = value;
        },
        set_replaced_product_id(value){
            this.replaced_product_id = value;
        },
        get_replaced_product_id(){
            return this.replaced_product_id;
        },
        get_replaced_product_name(){
            if(this.is_replaced){
                return this.pos.db.get_product_by_id(this.replaced_product_id).display_name;
            }
        },
        get_unit: function(){
            var unit_id = this.product.uom_id;
            if(!unit_id){
                return undefined;
            }
            unit_id = unit_id[0];
            if(!this.pos){
                return undefined;
            }
            return this.pos.units_by_id[unit_id];
        },
        get_product: function(){
            return this.product;
        },
        get_base_price:    function(){
            var rounding = this.pos.currency.rounding;
            return round_pr(this.get_extraPrice() * this.get_quantity(), rounding);
        },
        get_display_price: function(){
            return this.get_base_price();
        },
    });
    var CombolineCollection = Backbone.Collection.extend({
        model: exports.Comboline,
        comparator: 'categoryId',
    });
    /*COMBO LINE CODE END*/
    /*CUSTOMER SCREEN MODEL*/
    exports.CustomerModel = Backbone.Model.extend({
        initialize: function(attributes) {
            Backbone.Model.prototype.initialize.call(this, attributes);
            var  self = this;
            this.env = this.get('env');
            this.rpc = this.get('rpc');
            this.session = this.get('session');
            this.do_action = this.get('do_action');

            // Business data; loaded from the server at launch
            this.company_logo = null;
            this.company_logo_base64 = '';
            this.currency = null;
            this.company = null;
            this.pos_session = null;
            this.config = null;
            window.posmodel = this;

            var given_config = new RegExp('[\?&]config_id=([^&#]*)').exec(window.location.href);
            this.config_id = odoo.config_id || false;

            this.ready = this.load_server_data().then(function(){
                return;
            });
        },
        after_load_server_data: function(){
            this.load_orders();
            return Promise.resolve();
        },
        // releases ressources holds by the model at the end of life of the posmodel
        destroy: function(){
            // FIXME, should wait for flushing, return a deferred to indicate successfull destruction
            // this.flush();
            this.proxy.disconnect();
            this.barcode_reader.disconnect_from_proxy();
        },
        models: [
        {
            model:  'res.company',
            fields: [ 'currency_id', 'email', 'website', 'company_registry', 'vat', 'name', 'phone', 'partner_id' , 'country_id', 'state_id', 'tax_calculation_rounding_method'],
            ids:    function(self){ return [self.session.user_context.allowed_company_ids[0]]; },
            loaded: function(self,companies){ self.company = companies[0]; },
        },{
            model: 'pos.config',
            fields: [],
            domain: function(self){ return [['id','=', self.config_id]]; },
            loaded: function(self,configs){
                self.config = configs[0];
           },
        },{
            model: 'customer.display',
            fields: [],
            domain: function(self){ return [['config_id','=', self.config_id]]; },
            loaded: function(self,configs){
                self.ad_data = configs;
           },
        },{
            model: 'res.currency',
            fields: ['name','symbol','position','rounding','rate'],
            ids:    function(self){ return [self.config.currency_id[0], self.company.currency_id[0]]; },
            loaded: function(self, currencies){
                self.currency = currencies[0];
                if (self.currency.rounding > 0 && self.currency.rounding < 1) {
                    self.currency.decimals = Math.ceil(Math.log(1.0 / self.currency.rounding) / Math.log(10));
                } else {
                    self.currency.decimals = 0;
                }

                self.company_currency = currencies[1];
            },
        },{
            model:  'decimal.precision',
            fields: ['name','digits'],
            loaded: function(self,dps){
                self.dp  = {};
                for (var i = 0; i < dps.length; i++) {
                    self.dp[dps[i].name] = dps[i].digits;
                }
            },
        },{
            model:  'ad.video',
            fields: ['video_id'],
            domain: function(self){ return [['config_id','=', self.config_id]]; },
            loaded: function(self,result){
                self.ad_video_ids = [];
                for (var i = 0; i < result.length; i++) {
                    self.ad_video_ids.push(result[i].video_id)
                }
            },
        }
        ],

        load_server_data: function(){
            var self = this;
            var tmp = {};

            var loaded = new Promise(function (resolve, reject) {
                function load_model(index) {
                    if (index >= self.models.length) {
                        resolve();
                    } else {
                        var model = self.models[index];

                        var cond = typeof model.condition === 'function'  ? model.condition(self,tmp) : true;
                        if (!cond) {
                            load_model(index+1);
                            return;
                        }

                        var fields =  typeof model.fields === 'function'  ? model.fields(self,tmp)  : model.fields;
                        var domain =  typeof model.domain === 'function'  ? model.domain(self,tmp)  : model.domain;
                        var context = typeof model.context === 'function' ? model.context(self,tmp) : model.context || {};
                        var ids     = typeof model.ids === 'function'     ? model.ids(self,tmp) : model.ids;
                        var order   = typeof model.order === 'function'   ? model.order(self,tmp):    model.order;

                        if( model.model ){
                            var params = {
                                model: model.model,
                                context: _.extend(context, self.session.user_context || {}),
                            };

                            if (model.ids) {
                                params.method = 'read';
                                params.args = [ids, fields];
                            } else {
                                params.method = 'search_read';
                                params.domain = domain;
                                params.fields = fields;
                                params.orderBy = order;
                            }

                            self.rpc(params).then(function (result) {
                                try { // catching exceptions in model.loaded(...)
                                    Promise.resolve(model.loaded(self, result, tmp))
                                        .then(function () { load_model(index + 1); },
                                            function (err) { reject(err); });
                                } catch (err) {
                                    console.error(err.message, err.stack);
                                    reject(err);
                                }
                            }, function (err) {
                                reject(err);
                            });
                        } else if (model.loaded) {
                            try { // catching exceptions in model.loaded(...)
                                Promise.resolve(model.loaded(self, tmp))
                                    .then(function () { load_model(index +1); },
                                        function (err) { reject(err); });
                            } catch (err) {
                                reject(err);
                            }
                        } else {
                            load_model(index + 1);
                        }
                    }
                }

                try {
                    return load_model(0);
                } catch (err) {
                    return Promise.reject(err);
                }
            });

            return loaded;
        },
        format_currency: function(amount, precision) {
            var currency =
                this && this.currency
                    ? this.currency
                    : { symbol: '$', position: 'after', rounding: 0.01, decimals: 2 };

            amount = this.format_currency_no_symbol(amount, precision, currency);

            if (currency.position === 'after') {
                return amount + ' ' + (currency.symbol || '');
            } else {
                return (currency.symbol || '') + ' ' + amount;
            }
        },

        format_currency_no_symbol: function(amount, precision, currency) {
            if (!currency) {
                currency =
                    this && this.currency
                        ? this.currency
                        : { symbol: '$', position: 'after', rounding: 0.01, decimals: 2 };
            }
            var decimals = currency.decimals;

            if (precision && this.dp[precision] !== undefined) {
                decimals = this.dp[precision];
            }

            if (typeof amount === 'number') {
                amount = round_di(amount, decimals).toFixed(decimals);
                amount = field_utils.format.float(round_di(amount, decimals), {
                    digits: [69, decimals],
                });
            }
            return amount;
        },
    });

    var _posModelSuper = models.PosModel;
    models.PosModel = models.PosModel.extend({
        set_cashier: function(employee){
            var self = this;
            _posModelSuper.prototype.set_cashier.apply(this, arguments);
            if(self.env.pos.user){
                let current_user = self.env.pos.user;
                employee['company_id'] = current_user.company_id;
                employee['barcode'] = current_user.barcode;
            }
            this.set('cashier', employee);
            this.env.pos.db.set_cashier(this.get('cashier'));

            if(self.env.pos.config.enable_order_sync && employee){
                var from = moment(new Date()).locale('en').format('YYYY-MM-DD')+" 00:00:00";
                var to = moment(new Date()).locale('en').format('YYYY-MM-DD HH:mm:ss');
                var domain = [['date_order','>=',from], ['date_order', '<=', to]];

                rpc.query({model: 'pos.order',
                    method: 'search_read',
                    domain: domain,
                }, {async: false}).then(function(orders){
                    self.env.pos.db.add_orders(orders);
                    const orderFiltered = orders.filter(order => order.state == "draft");
                    self.env.pos.db.add_draft_orders(orderFiltered);
                    self.set_orderCount(orderFiltered.length);
                });
            }
        },
        set_orderCount: function(count){
            this.orderCount = count;
        },
        get_orderCount: function(count){
            return this.orderCount;
        },
        get_cashier: function(){
            return this.db.get_cashier() || this.get('cashier');
        },
        _save_to_server: function (orders, options) {
            var self = this;
            var res = _posModelSuper.prototype._save_to_server.apply(this, arguments);
            res.then(function(server_ids){
                if(server_ids.length > 0  && self.config.enable_order_sync){
                    var s_id = _.pluck(server_ids, 'id');
                    var params = {
                        model: 'pos.order',
                        method: 'search_read',
                        domain: [['id','in', s_id]],
                        fields: [],
                    }
                    rpc.query(params, {async: false}).then(function(orders){
                        if(orders.length > 0){
                            _.each(orders,function(order){
                                var exist_order = _.findWhere(self.db.get_orders_list(), {'pos_reference': order.pos_reference})
                                var exist_draft_order = _.findWhere(self.db.get_draft_orders_list(), {'pos_reference': order.pos_reference})
                                if(exist_order || exist_draft_order){
                                    _.extend(exist_order,order);
                                    _.extend(exist_draft_order,order);
                                } else{
                                    self.db.orders_list.push(order);
                                    self.db.draft_orders_list.push(order);
                                }
                                var new_order = _.sortBy(self.db.get_orders_list(), 'id').reverse();
                                var new_draft_order = _.sortBy(self.db.get_draft_orders_list(), 'id').reverse();
                                self.db.add_orders(new_order);
                                self.db.add_draft_orders(new_draft_order);
                            })
                        }
                    });
                }
            })
            return res;
        },
    });
    return exports;

});
