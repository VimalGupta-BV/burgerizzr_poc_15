# -*- coding: utf-8 -*-
#################################################################################
# Author      : Acespritech Solutions Pvt. Ltd. (<www.acespritech.com>)
# Copyright(c): 2012-Present Acespritech Solutions Pvt. Ltd.
# All Rights Reserved.
#
# This program is copyright property of the author mentioned above.
# You can`t redistribute it and/or modify it.
#
{
    'name': "POS Restaurant (Enterprise)",
    'summary': "POS Restaurant Combo, Kitchen Screen, Wallet, Gift Card, Gift Voucher.",
    'description': """
        POS Restaurant with Combo, Kitchen Screen, Wallet, Gift Card, Gift Voucher.
    """,
    'category': 'Point of Sale',
    'author': 'Acespritech Solutions Pvt. Ltd.',
    'website': "http://www.acespritech.com",
    'version': '1.0.0',
    'depends': ['base', 'point_of_sale', 'purchase', 'pos_hr', 'bus', 'product_expiry', 'hr_attendance','pos_restaurant', 'account'],
    'price': 1100.00,
    'currency': 'EUR',
    'images': [
        'static/description/main_screenshot.png',
    ],
    'data': [
        'security/ir.model.access.csv',
        'security/monitor_security.xml',
        'data/product_data.xml',
        'data/mail_template.xml',
        'data/ir_cron.xml',
        'data/send_mail.xml',
        # Expiry Dashboard Start
        'data/product_alert_email_template.xml',
        'data/product_expiry_scheduler.xml',
        # Expiry Dashboard End
        'data/account_financial_report_data.xml',
        'data/order_type.xml',
        'views/pos_config_view.xml',
        'views/remove_product_resion_view.xml',
        'views/pos_payment_method_view.xml',
        'views/pos_order_line_view.xml',
        'views/res_users_view.xml',
        'views/res_partner_view.xml',
        'views/wallet_management_view.xml',
        'views/wallet_view.xml',
        'views/gift_card.xml',
        'views/gift_voucher_view.xml',
        'views/pos_dashboard_view.xml',
        'views/product_view.xml',
        'views/hr_employee_view.xml',
        'views/res_config_setting.xml',
        'views/view_production_lot.xml',
        "views/generate_product_barcode_view.xml",
        'views/delivery_order_screen.xml',
        'views/product_expiry_report_view.xml',
        # Expiry Dashboard Start
        'views/product_expiry_config_view.xml',
        'views/product_expiry_dashboard_view.xml',
        # Expiry Dashboard End
        'views/combo_view.xml',
        'report/pos_z_report_template.xml',
        'report/aged_receivable_template.xml',
        'report/general_ledger_template.xml',
        'report/tax_report_template.xml',
        'report/partner_ledger_template.xml',
        'report/aged_payable_template.xml',
        'report/trial_balance_template.xml',
        'report/front_inventory_session_pdf_report_template.xml',
        'report/front_inventory_location_pdf_report_template.xml',
        'report/front_sales_report_pdf_template.xml',
        'report/non_moving_product_report.xml',
        'report/pos_sales_report_pdf_template.xml',
        'report/grp_category_product_expiry_report_template.xml',
        'report/report_financial.xml',
        'report/account_report.xml',
        'report/non_moving_report.xml',
        'report/product_expiry_report.xml',
        'report/report.xml',
        'wizard/account_report_partner_ledger_view.xml',
        'wizard/aged_payble_view.xml',
        'wizard/aged_receivable_view.xml',
        'wizard/balance_sheet.xml',
        'wizard/general_ledger_wiz_view.xml',
        'wizard/non_moving_stock.xml',
        'wizard/product_expiry_report_wizard_view.xml',
        'wizard/profit_and_loss.xml',
        'wizard/tax_report_wiz_view.xml',
        'wizard/trial_balance_wiz_view.xml',
        'wizard/wizard_pos_sale_report_view.xml',
        'wizard/wizard_pos_x_report.xml',
        'views/pos_delivery_service_view.xml',
    ],
    'assets': {
        'point_of_sale.assets': [
            'flexibite_ee_advance/static/src/scss/style.scss',
            'flexibite_ee_advance/static/src/css/restaurant_theme.css',
            'flexibite_ee_advance/static/src/css/style.css',
            'flexibite_ee_advance/static/src/scss/style.scss',
            'flexibite_ee_advance/static/src/css/pos.css',
            'flexibite_ee_advance/static/src/css/side_bar.css',
            'flexibite_ee_advance/static/src/css/lock_screen.css',
            'flexibite_ee_advance/static/src/css/pos_reprot.css',
            'flexibite_ee_advance/static/src/css/screen_style.css',
            'flexibite_ee_advance/static/src/css/kitchen_pos.css',
            'flexibite_ee_advance/static/src/js/models.js',
            'flexibite_ee_advance/static/src/js/db.js',
            'flexibite_ee_advance/static/src/js/Chrome.js',
            'flexibite_ee_advance/static/src/js/libs/flashcanvas.js',
            'flexibite_ee_advance/static/src/js/libs/jSignature.min.js',
            'flexibite_ee_advance/static/src/js/Printer.js',
            'flexibite_ee_advance/static/src/js/ChromeWidgets/**/*',
            'flexibite_ee_advance/static/src/js/Screens/**/*',
            'flexibite_ee_advance/static/src/js/CustomerDisplayWidgets/**/*',
            'flexibite_ee_advance/static/src/js/Popups/**/*',
            'flexibite_ee_advance/static/src/js/Screens/KitchenScreen/**/*',
            'flexibite_ee_advance/static/src/js/Screens/ComboScreen/**/*',
        ],
        'web.assets_backend': [
            'flexibite_ee_advance/static/src/css/PosDashboard/export.css',
            'flexibite_ee_advance/static/src/css/PosDashboard/style.css',
            'flexibite_ee_advance/static/src/css/PosDashboard/daterangepicker.css',
            'flexibite_ee_advance/static/src/css/PosDashboard/custom.css',
            'flexibite_ee_advance/static/src/js/PosDashboard/**/*',
            # POS Expiry Dashboard
            "flexibite_ee_advance/static/src/css/PosExpiryDashboard/my_style.css",
            "flexibite_ee_advance/static/src/css/PosExpiryDashboard/daterangepicker.css",
            'flexibite_ee_advance/static/src/js/PosExpiryDashboard/**/*',
        ],
        'web.assets_qweb': [
            'flexibite_ee_advance/static/src/xml/**/*',
           
        ],
    },
    'license': 'LGPL-3',
    "installable": True,
    'auto_install': False
}
#################################################################################
