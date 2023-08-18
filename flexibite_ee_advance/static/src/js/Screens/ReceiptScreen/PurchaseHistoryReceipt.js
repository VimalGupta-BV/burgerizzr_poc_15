odoo.define('flexibite_ee_advance.PurchaseHistoryReceipt', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class PurchaseHistoryReceipt extends PosComponent {
        constructor() {
            super(...arguments);
        }
    }
    PurchaseHistoryReceipt.template = 'PurchaseHistoryReceipt';

    Registries.Component.add(PurchaseHistoryReceipt);

    return PurchaseHistoryReceipt;
});
