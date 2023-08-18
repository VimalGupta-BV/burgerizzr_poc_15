odoo.define('flexibite_ee_advance.Orderline', function(require) {
    'use strict';
    
    const Orderline = require('point_of_sale.Orderline');
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const { useListener } = require('web.custom_hooks');
    const { posbus } = require('point_of_sale.utils');
    var core = require('web.core');
    var _t = core._t;

    const AsplRetOrderlineInh = (Orderline) => 
        class extends Orderline {
            constructor() {
                super(...arguments);
                useListener('click-uom-button', this.clickUomButton);
                useListener('click-to-open-note-text', this.clickOpenNoteText);
            }
            comboIconClicked() {
                this.trigger('edit-combo-product', { orderline: this.props.line });
            }
            comboInfoButtonClicked() {
                this.trigger('combo-product-info', { orderline: this.props.line });
            }
            get selectedOrderline() {
                return this.env.pos.get_order().get_selected_orderline();
            }
            get addStateColor(){
                if(this.props.line.state == 'Waiting'){
                    return '#555555';
                }else if(this.props.line.state == 'Preparing'){
                    return '#f44336';
                }else if(this.props.line.state == 'Delivering'){
                    return '#795548';
                }
            }
            async DeleteLineFromOrder(line){
                if (this.env.pos.user.delete_order_line_reason){
                    const reasonPosList = []
                    for (let reasonPos of this.env.pos.remove_product_reason) {
                        reasonPosList.push({
                            id: reasonPos.id,
                            label: reasonPos.name,
                            item: reasonPos,
                        });
                    }
                    const { confirmed, payload: selectedreason } = await this.showPopup(
                    'SelectionPopup',
                        {
                            title: this.env._t('Select Reason'),
                            list: reasonPosList,
                        }
                    );
                    if (confirmed) {
                        if (selectedreason.description){
                            const { confirmed, payload: inputNote } = await this.showPopup('TextAreaPopup', {
                                title: this.env._t('Add Reason'),
                            });
                            if (confirmed) {
                                var reason = {
                                    'product': line.product.id,
                                    'reason_id': selectedreason.id,
                                    'description': inputNote
                                }
                                this.env.pos.get_order().set_cancle_product_reason(reason)
                                await this.env.pos.get_order().set_delete_product(true)
                                line.set_quantity('remove')
                                this.env.pos.sync_from_server(this.env.pos.table, this.env.pos.get_order_list(), this.env.pos.get_order_with_uid());
                                return false
                            }
                        }else{
                            var reason = {
                                'product': line.product.id,
                                'reason_id': selectedreason.id,
                                'description': ""
                            }
                            await this.env.pos.get_order().set_cancle_product_reason(reason)
                            await this.env.pos.get_order().set_delete_product(true)
                            line.set_quantity('remove')
                            this.env.pos.sync_from_server(this.env.pos.table, this.env.pos.get_order_list(), this.env.pos.get_order_with_uid());
                            return false
                        }
                    }
                }else{
                    var reason = {
                        'product': line.product.id,
                        'reason_id': '',
                        'description': ""
                    }
                    await this.env.pos.get_order().set_cancle_product_reason(reason)
                    line.set_quantity('remove')
                    await this.env.pos.get_order().set_delete_product(true)
                    this.env.pos.sync_from_server(this.env.pos.table, this.env.pos.get_order_list(), this.env.pos.get_order_with_uid());
                    return false
                }
            }
            async clickOpenNoteText() {
                if (!this.selectedOrderline) return;
                const { confirmed, payload: inputNote } = await this.showPopup('TextAreaPopup', {
                    startingValue: this.selectedOrderline.get_note(),
                    title: this.env._t('Add Internal Note'),
                });
                if (confirmed) {
                    this.selectedOrderline.set_note(inputNote);
                }
            }
            async onClickDelete(orderline){
                const { confirmed } = await this.showPopup('ConfirmPopup', {
                    title: this.env._t('Confirmation'),
                    body: this.env._t('Are you sure you want to unassign lot/serial number(s) ?'),
                });
                if (confirmed){
                    var pack_lot_lines = orderline.pack_lot_lines;
                    var cids = [];
                    for(let i=0; i < pack_lot_lines.length; i++){
                        let lot_line = pack_lot_lines.models[i];
                        cids.push(lot_line.cid);
                    }
                    for(let j in cids){
                        pack_lot_lines.get({cid: cids[j]}).remove();
                    }
                    _.each(orderline.get_serials(), function(serial){
                        if(serial.isSelected){
                            serial['isSelected'] = false;
                        }
                    });
                    this.render();
                }
            }
            get filter_uom_by_category(){
                var list = []
                for (var uom in this.env.pos.units){
                    if(this.env.pos.units[uom].category_id[0] == this.env.pos.get_order().selected_orderline.get_unit().category_id[0]){
                        list.push({
                            id: this.env.pos.units[uom].id,
                            label: this.env.pos.units[uom].name,
                            isSelected: this.env.pos.units[uom].id
                            ? this.env.pos.units[uom].id === this.env.pos.get_order().selected_orderline.get_unit().id
                            : false,
                            item: this.env.pos.units[uom],
                        });
                    }
                }
                return list;
            }
            async clickUomButton(event) {
                const { confirmed, payload: selectedUOMCategory } = await this.showPopup('SelectionPopup', {
                    title: this.env._t('Select UOM'),
                    list: this.filter_uom_by_category,
                }); 
                if (confirmed){
                    var self = this;
                    var order = self.env.pos.get_order();
                    order.get_selected_orderline().set_custom_uom_id(selectedUOMCategory.id);
                    var res = order.get_selected_orderline().apply_uom();
                    if(self.env.pos.config.customer_display){
                        order.mirror_image_data();
                    }
                    if(!res){
                        alert("Something went to wrong!");
                    }
                    this.render();
                }
            }
        }

    Registries.Component.extend(Orderline, AsplRetOrderlineInh);

    return Orderline;
});
