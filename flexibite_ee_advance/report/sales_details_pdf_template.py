# -*- coding: utf-8 -*-
#################################################################################
# Author      : Acespritech Solutions Pvt. Ltd. (<www.acespritech.com>)
# Copyright(c): 2012-Present Acespritech Solutions Pvt. Ltd.
# All Rights Reserved.
#
# This program is copyright property of the author mentioned above.
# You can`t redistribute it and/or modify it.
#
#################################################################################

from odoo import models, api


class FrontSalesReportPdfTemplate(models.AbstractModel):
    _name = 'report.flexibite_ee_advance.front_sales_report_pdf_template'
    _description = "Flexiretail pos report sale report temp"

    @api.model
    def _get_report_values(self, docids, data=None):
        report = self.env['ir.actions.report']._get_report_from_name(
            'flexibite_ee_advance.front_sales_report_pdf_template')
        if data and data.get('form') and data.get('form').get('session_ids'):
            docids = self.env['pos.session'].browse(data['form']['session_ids'])
        return {'doc_ids': self.env['wizard.pos.x.report'].browse(data['ids']),
                'doc_model': report.model,
                'docs': self.env['pos.session'].browse(data['form']['session_ids']),
                'data': data,
                }


class PosSalesReportPdfTemplate(models.AbstractModel):
    _name = 'report.flexibite_ee_advance.pos_sales_report_pdf_template'
    _description = "Flexiretail pos report sale report temp"

    @api.model
    def _get_report_values(self, docids, data=None):
        report = self.env['ir.actions.report']. \
            _get_report_from_name('flexibite_ee_advance.pos_sales_report_pdf_template')
        if data and data.get('form') and data.get('form').get('session_ids'):
            docids = self.env['pos.session'].browse(data['form']['session_ids'])
        return {'doc_ids': self.env['wizard.pos.sale.report'].browse(data['ids']),
                'doc_model': report.model,
                'docs': self.env['pos.session'].browse(data['form']['session_ids']),
                'data': data,
                }

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
