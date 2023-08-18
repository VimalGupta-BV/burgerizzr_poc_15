odoo.define('flexibite_ee_advance.WarehouseScreen', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const { useListener } = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    var rpc = require('web.rpc');
    const { useState } = owl.hooks;

    class WarehouseScreen extends PosComponent {
        constructor() {
            super(...arguments);
        }
    }

    WarehouseScreen.template = 'WarehouseScreen';

    Registries.Component.add(WarehouseScreen);

    return WarehouseScreen;
});
