odoo.define('flexibite_ee_advance.Printer', function (require) {
"use strict";

    var Printer = require('point_of_sale.Printer').Printer;

    Printer.include({
        print_receipt: async function(receipt) {
            let order = this.pos.get_order();
            if (receipt && receipt.length > 1) {
                for( var i = 0 ; i < order.get_number_of_print(); i++) {
                    this.receipt_queue.push(receipt);
                }
            }else{
                if (receipt) {
                    this.receipt_queue.push(receipt);
                }
            }
            let image, sendPrintResult;
            while (this.receipt_queue.length > 0) {
                receipt = this.receipt_queue.shift();
                image = await this.htmlToImg(receipt);
                try {
                    sendPrintResult = await this.send_printing_job(image);
                } catch (error) {
                    // Error in communicating to the IoT box.
                    this.receipt_queue.length = 0;
                    return this.printResultGenerator.IoTActionError();
                }
                // rpc call is okay but printing failed because
                // IoT box can't find a printer.
                if (!sendPrintResult || sendPrintResult.result === false) {
                    this.receipt_queue.length = 0;
                    return this.printResultGenerator.IoTResultError();
                }
            }
            return this.printResultGenerator.Successful();
        },
    })

});
