odoo.define('flexibite_ee_advance.CustomerScreenButton', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class CustomerScreenButton extends PosComponent {
        async onClick() {
            return this.env.pos.do_action({
                type: 'ir.actions.act_url',
                url: '/web/customer_display/' + this.env.pos.pos_session.id,
            });
        }
    }
    CustomerScreenButton.template = 'CustomerScreenButton';

    Registries.Component.add(CustomerScreenButton);

    return CustomerScreenButton;
});
