odoo.define('flexibite_ee_advance.PopupProductLines', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const { useListener } = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    const { useState, useRef } = owl.hooks;

    class PopupProductLines extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({ productQty : this.props.line.qty });
        }
        onInputKeyDownNumberVlidation(e) {
            if(e.which != 190 && e.which != 110 && e.which != 8 && e.which != 0 && (e.which < 48 || e.which > 57) && (e.which < 96 || e.which > 105) && (e.which < 37 || e.which > 40)) {
                e.preventDefault();
            }
        }
        clickMinus(){
            if(this.props.line.qty == 1){
                return
            }else{
                this.props.line.qty -= 1
                this.state.productQty = this.props.line.qty;
            return this.props.line.qty;
            }
        }
        clickPlus(){
            this.props.line.qty += 1;
            this.state.productQty = this.props.line.qty;
            return this.props.line.qty;
        }

    }

    PopupProductLines.template = 'PopupProductLines';

    Registries.Component.add(PopupProductLines);

    return PopupProductLines;
});
