odoo.define('flexibite_ee_advance.LinkConnection', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const { useState } = owl.hooks;
    const Registries = require('point_of_sale.Registries');
    var rpc = require('web.rpc');

    class LinkConnection extends PosComponent {}
    LinkConnection.template = 'LinkConnection';

    Registries.Component.add(LinkConnection);

    return LinkConnection;
});
