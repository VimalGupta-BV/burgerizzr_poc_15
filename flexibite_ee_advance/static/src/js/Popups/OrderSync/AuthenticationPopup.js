odoo.define('flexibite_ee_advance.AuthenticationPopup', function(require) {
    'use strict';

    const { useState, useRef } = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');
    const { useListener } = require('web.custom_hooks');

    class AuthenticationPopup extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.state = useState({ pin: '' });
            this.pin = useRef('input');
        }

        getPayload() {
            return this.state.pin;
        }

        cancel() {
            this.trigger('close-popup');
        }

    }

    AuthenticationPopup.template = 'AuthenticationPopup';

    AuthenticationPopup.defaultProps = {
        confirmText: 'Confirm',
        cancelText: 'Close',
        title: '',
        body: '',
    };

    Registries.Component.add(AuthenticationPopup);

    return AuthenticationPopup;
});
