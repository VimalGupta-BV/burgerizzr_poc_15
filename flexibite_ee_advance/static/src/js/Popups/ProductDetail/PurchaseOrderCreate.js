odoo.define('flexibite_ee_advance.PurchaseOrderCreate', function(require) {
    'use strict';

    const { useState, useRef } = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    var rpc = require('web.rpc');


    class PurchaseOrderCreate extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.state = useState({ CustomerName: '', ProductQty: 1.00, SendMail: false, CustomerNameBlank:false});
            this.supplierId = false;
        }
        clearPartnerSearch() {
            $('.search-supplier').val('')
        }
        async mounted(){
            super.mounted(...arguments);
            var self = this;
            $('.search-supplier').autocomplete()
            this.render()
        }
        async searchForPartner(){
            var self = this;
            var partner_data = await this.env.pos.db.search_partner($('.search-supplier').val());
            if(partner_data){
                partner_data.map(function(data){
                    data['label'] = data.name;
                    data['value'] = data.name;
                    data['id'] = data.id
                  return data;
                });

                $('.search-supplier').autocomplete({
                    source: function(req, resp) {
                        var results = [];
                        $.each(partner_data, function(idx, val) {
                            if (val) {
                                results.push(val);
                                return;
                            }
                        });
                        resp(results);
                    },
                    select: function(event, partner){
                        self.supplierId = partner.item.id;
                    },
                    focus: function (event) {
                        event.preventDefault();
                    },
                })
//                $('.search-supplier').autocomplete("option", "position", { my : "left top", at: "left bottom" });
            }
        }
        onInputKeyDownNumberVlidation(e) {
            if(e.which != 110 && e.which != 8 && e.which != 0 && e.key != this.env.pos.db.decimalSeparator() && e.key != this.env.pos.db.decimalSeparator() && (e.which < 48 || e.which > 57 || e.shiftKey) && (e.which < 96 || e.which > 105) && (e.which < 37 || e.which > 40)) {
                e.preventDefault();
            }
        }
        getPayload() {
            var line = this.getPurchaseOrderLineData();
            var supplier = this.supplierId;
            return {order_line:line, partner_id:supplier, send_mail: this.state.SendMail};
        }
        getPurchaseOrderLineData() {
            var order_line = []
            for (var i=0;i<=this.props.SelectedProductList.length;i++){
                var line = {}
                if(this.props.SelectedProductList[i]){
                    var qty = $('#'+this.props.SelectedProductList[i].id).val();
                    line['product_id'] = this.props.SelectedProductList[i].id;
                    line['qty'] = this.env.pos.db.thousandsDecimalChanger(qty);
                    order_line.push(line);
                }
            }
            return order_line
        }
        DeletePurchaseLine(event){
            var SelectedProductList = _.without(this.props.SelectedProductList, _.findWhere(this.props.SelectedProductList, {id: event.id}));
            this.props.SelectedProductList = SelectedProductList
            this.render();
        }
        cancel() {
            this.trigger('close-popup');
            var order = this.env.pos.get_order();
            var lines = order.get_orderlines();
            if(lines.length > 0){
                var lines_ids = []
                if(!order.is_empty()) {
                    _.each(lines,function(item) {
                        lines_ids.push(item.id);
                    });
                    _.each(lines_ids,function(id) {
                        order.remove_orderline(order.get_orderline(id));
                    });
                }
            }
        }
        async print(){ 
            var self = this
            var internal_transfer = []
            await rpc.query({
                model: 'stock.picking',
                method: 'search_read',
                domain: [['id', '=', this.props.order_id]]
            }).then(function(res){
                    if(res){
                        internal_transfer = res
                    }
            });
            var use_posbox = this.env.pos.config.is_posbox && (this.env.pos.config.iface_print_via_proxy);
            if (use_posbox || this.env.pos.config.other_devices) {
                const report = this.env.qweb.renderToString(
                    'InternalTransferReceipt',{
                    props: {'RecordData': internal_transfer, 'RecoedLine':self.env.pos.get_order().get_orderlines()},
                });
                const printResult = await this.env.pos.proxy.printer.print_receipt(report);
                if (!printResult.successful) {
                    await this.showPopup('ErrorPopup', {
                        title: printResult.message.title,
                        body: printResult.message.body,
                    });
                }
            } else {
                await this.showTempScreen('BillScreen', {'check':'from_internal_transfer',
                    'receiptData':internal_transfer,
                    'receiptLineData':self.env.pos.get_order().get_orderlines()});
            }
            this.trigger('close-popup');
        }
        async confirm() {
            this.state.CustomerNameBlank = !this.state.CustomerName ? true : false;
            if (!this.state.CustomerNameBlank){
                this.props.resolve({ confirmed: true, payload: await this.getPayload() });
                this.trigger('close-popup');
            }
        }
    }
    PurchaseOrderCreate.template = 'PurchaseOrderCreate';
    PurchaseOrderCreate.defaultProps = {
        confirmText: 'Create',
        cancelText: 'Close',
        printText: 'Print',
        title: '',
        body: '',
    };

    Registries.Component.add(PurchaseOrderCreate);

    return PurchaseOrderCreate;
});
