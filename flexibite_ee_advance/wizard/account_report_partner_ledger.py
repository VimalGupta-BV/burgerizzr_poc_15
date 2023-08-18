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
import base64
import io

import xlwt
from odoo import fields, models
from odoo.tools.misc import formatLang


class AccountPartnerLedgerReportWizard(models.TransientModel):
    _name = "account.report.partner.ledger"
    _description = "Account Partner Ledger"

    target_move = fields.Selection([('posted', 'All Posted Entries'),
                                    ('all', 'All Entries'),
                                    ], string='Target Moves', required=True, default='posted')

    result_selection = fields.Selection([('customer', 'Receivable Accounts'),
                                         ('supplier', 'Payable Accounts'),
                                         ('customer_supplier', 'Receivable and Payable Accounts')
                                         ], string="Partner's", required=True, default='customer')
    amount_currency = fields.Boolean("With Currency",
                                     help="It adds the currency column on report"
                                          " if the currency differs from the company currency.")
    reconciled = fields.Boolean('Reconciled Entries')
    date_from = fields.Date(string='Start Date')
    date_to = fields.Date(string='End Date')
    company_id = fields.Many2one('res.company', string='Company', readonly=True,
                                 default=lambda self: self.env.user.company_id)
    journal_ids = fields.Many2many('account.journal', string='Journals', required=True,
                                   default=lambda self: self.env['account.journal'].search([]))
    data = fields.Binary(string="Data")
    state = fields.Selection([('choose', 'choose'), ('get', 'get')], string="State",
                             default='choose')
    name = fields.Char(string='File Name', readonly=True)

    def _build_contexts(self, data):
        result = {
            'journal_ids': 'journal_ids' in data['form'] and data['form'][
                'journal_ids'] or False,
            'state': 'target_move' in data['form'] and data['form']['target_move'] or '',
            'date_from': data['form']['date_from'] or False,
            'date_to': data['form']['date_to'] or False,
        }
        result['strict_range'] = True if result['date_from'] else False
        return result

    def generate_partner_ledger(self, data=None):
        data = {
            'ids': self.env.context.get('active_ids', []),
            'model': self.env.context.get('active_model', 'ir.ui.menu'),
            'form': self.read(
                ['date_from', 'date_to', 'journal_ids', 'target_move', 'reconciled',
                 'result_selection', 'amount_currency'])[0]
        }
        used_context = self._build_contexts(data)
        data['form']['used_context'] = dict(used_context,
                                            lang=self.env.context.get('lang') or 'en_US')
        datas = {
            'ids': self._ids,
            'docs': self._ids,
            'model': 'account.report.partner.ledger',
            'form': data['form'],
        }
        return self.env.ref('flexibite_ee_advance.report_partner_ledger').report_action(
            self, data=datas)

    def print_xls(self):
        report_obj = self.env['report.flexibite_ee_advance.partner_ledger_template'].with_context(
            active_model='account.report.partner.ledger')

        data = {
            'ids': self.env.context.get('active_ids', []),
            'model': self.env.context.get('active_model', 'ir.ui.menu'),
            'form': self.read(
                ['date_from', 'date_to', 'journal_ids', 'target_move', 'reconciled',
                 'result_selection', 'amount_currency'])[0]}
        used_context = self._build_contexts(data)
        data['form']['used_context'] = dict(used_context,
                                            lang=self.env.context.get('lang') or 'en_US')
        datas = {
            'ids': self._ids,
            'docs': self._ids,
            'model': 'account.report.partner.ledger',
            'form': data['form']
        }
        report_data = report_obj._get_report_values(self, data=datas)
        style_p = xlwt.XFStyle()
        style_pc = xlwt.XFStyle()
        style_border = xlwt.XFStyle()
        text_right = xlwt.XFStyle()
        fontbold = xlwt.XFStyle()
        alignment = xlwt.Alignment()
        alignment.horz = xlwt.Alignment.HORZ_CENTER
        alignment_right = xlwt.Alignment()
        alignment_right.horz = xlwt.Alignment.HORZ_RIGHT
        text_r = xlwt.Alignment()
        text_r.horz = xlwt.Alignment.HORZ_RIGHT
        style_pc.alignment = alignment_right
        font = xlwt.Font()
        font_p = xlwt.Font()
        text_right.font = font_p
        text_right.alignment = text_r
        borders = xlwt.Borders()
        borders.bottom = xlwt.Borders.THIN
        borders.top = xlwt.Borders.THIN
        borders.right = xlwt.Borders.THIN
        borders.left = xlwt.Borders.THIN
        font.bold = False
        font_p.bold = True
        style_p.font = font
        style_pc.alignment = alignment_right
        style_border.font = font_p
        fontbold.font = font_p
        style_border.alignment = alignment
        style_border.borders = borders
        workbook = xlwt.Workbook(encoding="utf-8")
        worksheet = workbook.add_sheet("Tax Sheet")
        worksheet.col(0).width = 6000
        worksheet.col(1).width = 5600
        worksheet.col(2).width = 5600
        company_name = self.company_id.name
        if self.company_id.email:
            company_name += '\n' + self.company_id.email
        if self.company_id.phone:
            company_name += '\n' + self.company_id.phone
        worksheet.write_merge(0, 2, 0, 2, company_name, style=style_border)
        worksheet.write_merge(3, 3, 0, 2,
                              'From ' + str(self.date_from) + ' To ' + str(self.date_to),
                              style_border)
        worksheet.write_merge(4, 4, 0, 2, 'Partner Ledger Report', style_border)
        worksheet.write_merge(5, 5, 0, 0, 'Date', text_right)
        worksheet.write_merge(5, 5, 1, 1, 'JRNL', text_right)
        worksheet.write_merge(5, 5, 2, 2, 'Account', text_right)
        worksheet.write_merge(5, 5, 3, 3, 'Ref', text_right)
        worksheet.write_merge(5, 5, 4, 4, 'Debit', text_right)
        worksheet.write_merge(5, 5, 5, 5, 'Credit', text_right)
        worksheet.write_merge(5, 5, 6, 6, 'Balance', text_right)
        worksheet.write_merge(5, 5, 7, 7, 'Currency', text_right)
        row = 6
        for o in report_data.get('docs'):
            worksheet.write_merge(row, row, 0, 0, str(o.ref) + '-' + o.name, text_right)
            worksheet.write_merge(row, row, 4, 4, formatLang(
                self.env, float(
                    report_obj._sum_partner(report_data.get('data'), o, 'debit')),
                currency_obj=self.env.user.company_id.currency_id),
                                  text_right)
            worksheet.write_merge(row, row, 5, 5, formatLang(
                self.env, float(
                    report_obj._sum_partner(report_data.get('data'), o, 'credit')),
                currency_obj=self.env.user.company_id.currency_id),
                                  text_right)
            worksheet.write_merge(row, row, 6, 6, formatLang(
                self.env, float(
                    report_obj._sum_partner(report_data.get('data'), o, 'debit - credit')),
                currency_obj=self.env.user.company_id.currency_id),
                                  text_right)
            for line in report_obj._lines(report_data.get('data'), o):
                row += 1
                worksheet.write_merge(row, row, 0, 0, line.get('date'), text_right)
                worksheet.write_merge(row, row, 1, 1, line.get('code'), text_right)
                worksheet.write_merge(row, row, 2, 2, line.get('a_code'), text_right)
                worksheet.write_merge(row, row, 3, 3, line.get('displayed_name'), text_right)
                worksheet.write_merge(row, row, 4, 4, formatLang(
                    self.env, float(line.get('debit')),
                    currency_obj=self.env.user.company_id.currency_id),
                                      text_right)
                worksheet.write_merge(row, row, 5, 5,
                                      formatLang(self.env, float(line.get('credit')),
                                                 currency_obj=self.env.user.company_id.currency_id),
                                      text_right)
                worksheet.write_merge(row, row, 6, 6,
                                      formatLang(self.env, float(line.get('progress')),
                                                 currency_obj=self.env.user.company_id.currency_id),
                                      text_right)
                worksheet.write_merge(row, row, 7, 7, line.get('amount_currency'), text_right)
            row += 2

        file_data = io.BytesIO()
        workbook.save(file_data)

        self.write({
            'state': 'get',
            'data': base64.encodebytes(file_data.getvalue()),
            'name': 'partner_ledger_report.xls'
        })
        return {
            'name': 'Tax Report',
            'type': 'ir.actions.act_window',
            'res_model': 'account.report.partner.ledger',
            'view_mode': 'form',
            'res_id': self.id,
            'target': 'new'
        }
