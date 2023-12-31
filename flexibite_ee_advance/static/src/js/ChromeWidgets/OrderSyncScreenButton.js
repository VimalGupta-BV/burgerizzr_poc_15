odoo.define('flexibite_ee_advance.OrderSyncScreenButton', function(require) {
    'use strict';

    const { useState } = owl;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');


    class OrderSyncScreenButton extends PosComponent {
        constructor() {
            super(...arguments);
        }
        onClick() {
            this.trigger('click-sync-order-screen');
        }
        get count() {
            if (this.env.pos) {
                return this.env.pos.kitchenScreenData.length;
            } else {
                return 0;
            }
        }
    }
    OrderSyncScreenButton.template = 'OrderSyncScreenButton';

    Registries.Component.add(OrderSyncScreenButton);

    return OrderSyncScreenButton;
});
