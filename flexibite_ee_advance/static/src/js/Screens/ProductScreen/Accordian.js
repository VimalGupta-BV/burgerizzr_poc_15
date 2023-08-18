odoo.define('flexibite_ee_advance.Accordian', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');
    const { useState } = owl.hooks;

    class Accordian extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({'active': ''})
        }
        get active(){
            return this.props.active ? 'active' : '';
        }
        toggleAccordian(){
            this.state.active = !this.state.active;
        }
        get toggleClass(){
            return this.state.active ? 'fa fa-minus': 'fa fa-plus';
        }
    }

    Accordian.template = 'Accordian';

    Registries.Component.add(Accordian);

    return Accordian;
});
