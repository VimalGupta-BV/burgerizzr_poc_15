odoo.define('flexibite_ee_advance.InternalTransferReceipt', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class InternalTransferReceipt extends PosComponent {
        constructor() {
            super(...arguments);
        }
    }
    InternalTransferReceipt.template = 'InternalTransferReceipt';

    Registries.Component.add(InternalTransferReceipt);

    return InternalTransferReceipt;
});
