odoo.define('point_of_sale.ReferenceClientLine', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class ReferenceClientLine extends PosComponent {
        get highlight() {
            return this.props.partner !== this.props.selectedRefClient ? '' : 'highlight';
        }
    }
    ReferenceClientLine.template = 'ReferenceClientLine';

    Registries.Component.add(ReferenceClientLine);

    return ReferenceClientLine;
});
