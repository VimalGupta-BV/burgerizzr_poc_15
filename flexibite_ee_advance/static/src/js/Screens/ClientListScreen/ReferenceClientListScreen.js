odoo.define('point_of_sale.ReferenceClientListScreen', function(require) {
    'use strict';

    const { debounce } = owl.utils;
    const PosComponent = require('point_of_sale.PosComponent');
    const Registries = require('point_of_sale.Registries');

    class ReferenceClientListScreen extends PosComponent {
        constructor() {
            super(...arguments);
            this.state = {
                query: null,
                selectedRefClient: '',
                detailIsShown: false,
            };
            this.updateClientList = debounce(this.updateClientList, 70);
        }
        back() {
            if(this.state.detailIsShown) {
                this.state.detailIsShown = false;
                this.render();
            } else {
                this.props.resolve({ confirmed: false, payload: false });
                this.trigger('close-temp-screen');
            }
        }
        confirm() {
            this.props.resolve({ confirmed: true, payload: this.state.selectedRefClient });
            this.trigger('close-temp-screen');
        }
        get currentOrder() {
            return this.env.pos.get_order();
        }
        get clients() {
            if (this.state.query && this.state.query.trim() !== '') {
                return this.env.pos.db.search_partner(this.state.query.trim());
            } else {
                return this.env.pos.db.get_partners_sorted(1000);
            }
        }
        get isNextButtonVisible() {
            return this.state.selectedRefClient ? true : false;
        }
        get nextButton() {
            if (!this.props.client) {
                return { command: 'set', text: 'Set Customer' };
            } else if (this.props.client && this.props.client === this.state.selectedRefClient) {
                alert('Cannot Select Reference Customer Same As Current Order Customer !!!!');
                return;
            } else {
                return { command: 'set', text: 'Set Reference Customer' };
            }
        }
        updateClientList(event) {
            this.state.query = event.target.value;
            const clients = this.clients;
            if (event.code === 'Enter' && clients.length === 1) {
                this.state.selectedRefClient = clients[0];
                this.clickNext();
            } else {
                this.render();
            }
        }
        clickClient(event) {
            let partner = event.detail.client;
            if (this.state.selectedRefClient === partner) {
                this.state.selectedRefClient = null;
            } else {
                this.state.selectedRefClient = partner;
            }
            this.render();
        }
        clickNext() {
            this.state.selectedRefClient = this.nextButton.command === 'set' ? this.state.selectedRefClient : null;
            this.confirm();
        }
    }
    ReferenceClientListScreen.template = 'ReferenceClientListScreen';

    Registries.Component.add(ReferenceClientListScreen);

    return ReferenceClientListScreen;
});
