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

from odoo import fields, models, api


class WizardPOSXReport(models.TransientModel):
    _name = 'wizard.pos.x.report'
    _description = 'Print Session in Progress Report Wizard'

    def print_x_report(self):
        datas = {'ids': self._ids,
                 'form': self.read()[0],
                 'model': 'wizard.pos.x.report'}
        return self.env.ref('flexibite_ee_advance.report_pos_sales_pdf_front').report_action(self,
                                                                                              data=datas)

    session_ids = fields.Many2many('pos.session', 'pos_session_wizard_rel', 'x_wizard_id',
                                   'pos_session_id',
                                   string="Session(s)")
    report_type = fields.Selection([('thermal', 'Thermal'),
                                    ('pdf', 'PDF')], default='pdf', readonly=True,
                                   string="Report Type")
    proxy_ip = fields.Char(string="Proxy IP")

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
