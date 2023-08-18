odoo.define('flexibite_ee_advance.CreateDraftOrderPopup', function(require) {
    'use strict';

    const { useState, useRef } = owl.hooks;
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');

    class CreateDraftOrderPopup extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
        }

        cancel() {
            this.trigger('close-popup');
        }
    }
    CreateDraftOrderPopup.template = 'CreateDraftOrderPopup';
    CreateDraftOrderPopup.defaultProps = {
        confirmText: 'Confirm',
        cancelText: 'Cancel',
        title: '',
        body: '',
    };

    Registries.Component.add(CreateDraftOrderPopup);

    return CreateDraftOrderPopup;
});
