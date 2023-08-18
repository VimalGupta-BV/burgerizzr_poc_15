odoo.define('flexibite_ee_advance.OpenDetailButton', function(require) {
    'use strict';

    const PosComponent = require('point_of_sale.PosComponent');
    const ProductScreen = require('point_of_sale.ProductScreen');
    const { useState } = owl.hooks;
    const { useListener } = require('web.custom_hooks');
    const Registries = require('point_of_sale.Registries');
    var rpc = require('web.rpc');

    class OpenDetailButton extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = useState({ flag: false, componentFlag: false});
            useListener('close-side-menu', () => this.toggle('flag'));
            this.get_connected = true
        }
        async connectionCheck(){
            var self = this;
            try {
                await rpc.query({
                    model: 'pos.session',
                    method: 'connection_check',
                    args: [this.env.pos.pos_session.id],
                });
                this.get_connected = true
                this.env.pos.get_order().set_connected(true)
            } catch (error) {
                this.get_connected = false
                self.env.pos.get_order().set_connected(false)
                if (error instanceof Error) {
                    throw error;
                } else {
                    // NOTE: error here is most probably undefined
                    this.showPopup('ErrorPopup', {
                        title: this.env._t('Network Error'),
                        body: this.env._t('Please check your internet connection and try again.'),
                    });
                }
            }
        }
        async toggle(key) {
            await this.connectionCheck()
            if (this.get_connected){
                this.trigger('close-side-sub-menu')
                this.state[key] = !this.state[key];
            }else{
                this.get_connected = false;
            }
        }
    }
    OpenDetailButton.template = 'OpenDetailButton';

    Registries.Component.add(OpenDetailButton);

    return OpenDetailButton;
});
