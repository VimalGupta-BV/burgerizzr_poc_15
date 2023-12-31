odoo.define('flexibite_ee_advance.WalletPopup', function(require) {
    'use strict';

    const { useState, useRef } = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');

    class WalletPopup extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            if (this.props.defined_amount){
                this.state = useState({ WalletAmount: this.props.defined_amount, WalletValidation: true});
            }else{
                this.state = useState({ WalletAmount: 0.00, WalletValidation: true});
            }
            this.WalletAmount = useRef('WalletAmount');
        }
        onInputKeyDownNumberValidation(e) {
            if(e.which != 110 && e.which != 8 && e.which != 0 && e.key != this.env.pos.db.decimalSeparator() && e.key != this.env.pos.db.decimalSeparator() && (e.which < 48 || e.which > 57 || e.shiftKey) && (e.which < 96 || e.which > 105) && (e.which < 37 || e.which > 40)) {
                e.preventDefault();
            }
        }
        onInputKeyUpValidation(e) {
            if(Number(this.state.WalletAmount) <= Number(this.props.defined_amount) &&
                Number(this.state.WalletAmount) != 0) {
                $('#points').css('border','');
                this.state.WalletValidation = true;
            } else{
                $('#points').css('border','1px solid red');
                this.state.WalletValidation = false;
            }
        }
        getPayload() {
            return {amount:this.state.WalletAmount};
        }
        cancel() {
            this.trigger('close-popup');
        }
    }
    WalletPopup.template = 'WalletPopup';
    WalletPopup.defaultProps = {
        confirmText: 'Add to Wallet',
        cancelText: 'Cancel',
        title: '',
        body: '',
    };

    Registries.Component.add(WalletPopup);

    return WalletPopup;
});
