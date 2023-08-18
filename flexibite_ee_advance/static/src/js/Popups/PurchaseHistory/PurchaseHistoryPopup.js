odoo.define('flexibite_ee_advance.PurchaseHistoryPopup', function(require) {
    'use strict';

    const { useState, useRef } = owl.hooks;
    const { useListener } = require('web.custom_hooks');
    const AbstractAwaitablePopup = require('point_of_sale.AbstractAwaitablePopup');
    const Registries = require('point_of_sale.Registries');

    class PurchaseHistoryPopup extends AbstractAwaitablePopup {
        constructor() {
            super(...arguments);
            this.state = useState({ ProductPurchaseHistory: 'CartProduct'});
            useListener('print-product-and-order-receipt', this.PrintProductAndOrderReceipt);
        }
        CartProductPurchaseHistory(event){
            this.state.ProductPurchaseHistory = event === 'last' ? 'LastOrder' : 'CartProduct';
        }
        async PrintProductAndOrderReceipt(){
            const usePosBox = this.env.pos.config.is_posbox && this.env.pos.config.iface_print_via_proxy;
            var dataToBePrint ={'data': this.state.ProductPurchaseHistory === "LastOrder"
                                        ? this.props.last_purchase_history
                                        : this.props.product_history,
                                'customer_name': this.env.pos.get_order().get_client_name(),
                                'last_order_name': this.props.last_order_name,
                                'last_order_date': this.props.last_order_date,
                                'ProductPurchaseHistory':this.state.ProductPurchaseHistory,
                                'pos': this.env.pos};
            if (usePosBox || this.env.pos.config.other_devices) {
                const report = this.env.qweb.renderToString( 'PurchaseHistoryReceipt', { props: dataToBePrint });
                const printResult = await this.env.pos.proxy.printer.print_receipt(report);
                if (!printResult.successful) {
                    await this.showPopup('ErrorPopup', {
                        title: printResult.message.title,
                        body: printResult.message.body,
                    });
                }
                this.trigger('close-popup');
            } else {
                dataToBePrint['check'] = 'from_product_history';
                this.trigger('close-popup');
                await this.showTempScreen('BillScreen', dataToBePrint);
            }
        }
        cancel() {
            this.trigger('close-popup');
        }
    }
    PurchaseHistoryPopup.template = 'PurchaseHistoryPopup';
    PurchaseHistoryPopup.defaultProps = {
        confirmText: 'Add to Wallet',
        cancelText: 'Cancel',
        title: '',
        body: '',
    };

    Registries.Component.add(PurchaseHistoryPopup);

    return PurchaseHistoryPopup;
});
