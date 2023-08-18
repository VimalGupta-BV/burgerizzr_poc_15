odoo.define('flexibite_ee_advance.NumpadWidget', function (require) {
    'use strict';

    const NumpadWidget = require('point_of_sale.NumpadWidget');
    const Registries = require('point_of_sale.Registries');

    const NumpadWidgetInh = (NumpadWidget) =>
        class extends NumpadWidget {
            constructor() {
                super(...arguments);
            }
            changeMode(mode) {
                if (!this.env.pos.get_order().get_refund_order()){
                    if (!this.hasPriceControlRights && mode === 'price') {
                        return;
                    }
                    if (!this.hasManualDiscount && mode === 'discount') {
                        return;
                    }
                    if(this.env.pos.config.enable_operation_restrict){
                        if (!this.env.pos.user.can_change_price && mode === 'price') {
                            return;
                        }
                        if (!this.env.pos.user.can_give_discount && mode === 'discount') {
                            return;
                        }
                    }
                    this.trigger('set-numpad-mode', { mode });
                }
            }
            sendInput(key) {
                if (!this.env.pos.get_order().get_refund_order()){
                    this.trigger('numpad-click-input', { key });
                }else{
                    if (key == "Backspace"){
                        this.trigger('numpad-click-input', { key });
                    }
                }
            }
        };

    Registries.Component.extend(NumpadWidget, NumpadWidgetInh);

    return NumpadWidget;
});
