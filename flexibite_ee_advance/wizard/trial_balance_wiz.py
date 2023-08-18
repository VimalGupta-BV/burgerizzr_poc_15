# -*- coding: utf-8 -*-

import base64
import io

import xlwt
from odoo import fields, models
from odoo.tools.misc import formatLang


class TrialBalanceReportWizard(models.TransientModel):
    _name = "trial.balance.wiz"
    _description = "Trial Balance Wizard"

    company_id = fields.Many2one('res.company', string='Company', readonly=True,
                                 default=lambda self: self.env.user.company_id)
    date_from = fields.Date(string='Start Date')
    date_to = fields.Date(string='End Date')
    target_move = fields.Selection([('posted', 'All Posted Entries'),
                                    ('all', 'All Entries'),
                                    ], string='Target Moves', required=True, default='posted')
    display_account = fields.Selection([('all', 'All'), ('movement', 'With movements'),
                                        ('not_zero', 'With balance is not equal to 0'), ],
                                       string='Display Accounts', required=True, default='movement')
    include_init_balance = fields.Boolean(string="Include Initial Balance")
    data = fields.Binary(string="Data")
    state = fields.Selection([('choose', 'choose'), ('get', 'get')], string="State",
                             default='choose')
    name = fields.Char(string='File Name', readonly=True)
    journal_ids = fields.Many2many('account.journal', 'account_balance_report_journal_rel',
                                   'account_id', 'journal_id',
                                   string='Journals', required=True, default=[])

    def print_pdf(self, data=None):
        data = {
            'ids': self.env.context.get('active_ids', []),
            'model': self.env.context.get('active_model', 'ir.ui.menu'),
            'form': self.read(['date_from', 'date_to',
                               'journal_ids', 'target_move', 'display_account',
                               'include_init_balance'])[0]}
        datas = {
            'ids': self._ids,
            'docs': self._ids,
            'model': 'trial.balance.wiz',
            'form': data['form'],
            'used_context': {
                'company_id': self.env.user.company_id.id,
                'date_from': str(self.date_from) if self.date_from else False,
                'date_to': str(self.date_to) if self.date_to else False,
                'journal_ids': False,
                'lang': self.env.user.lang,
                'state': self.target_move,
            }
        }
        records = self.env[data['model']].browse(data.get('ids', []))
        return self.env.ref('flexibite_ee_advance.report_trial_balance').report_action(
            records, data=datas)

    def print_xls(self):
        data = {
            'ids': self.env.context.get('active_ids', []),
            'model': self.env.context.get('active_model', 'ir.ui.menu'),
            'form': self.read(
                ['date_from', 'date_to', 'journal_ids', 'target_move', 'display_account',
                 'include_init_balance'])[0]}
        data['form']['date_from'] = str(self.date_from) if self.date_from else ''
        data['form']['date_to'] = str(self.date_to) if self.date_to else ''
        datas = {
            'ids': self._ids,
            'docs': self._ids,
            'model': 'trial.balance.wiz',
            'form': data['form'],
            'used_context': {
                'company_id': self.env.user.company_id.id,
                'date_from': str(self.date_from) if self.date_from else False,
                'date_to': str(self.date_to) if self.date_to else False,
                'journal_ids': False,
                'lang': self.env.user.lang,
                'state': self.target_move,
            }
        }
        records = self.env[data['model']].browse(data.get('ids', []))
        report_obj = self.env['report.flexibite_ee_advance.trial_balance_template']
        style_p = xlwt.XFStyle()
        style_pc = xlwt.XFStyle()
        style_border = xlwt.XFStyle()
        fontbold = xlwt.XFStyle()
        font_bold = xlwt.XFStyle()
        alignment = xlwt.Alignment()
        alignment.horz = xlwt.Alignment.HORZ_CENTER
        alignment_amt = xlwt.Alignment()
        alignment_amt.horz = xlwt.Alignment.HORZ_RIGHT
        alignment_lft = xlwt.Alignment()
        alignment_lft.horz = xlwt.Alignment.HORZ_LEFT
        font = xlwt.Font()
        font_p = xlwt.Font()
        borders = xlwt.Borders()
        borders.bottom = xlwt.Borders.THIN
        borders.top = xlwt.Borders.THIN
        borders.right = xlwt.Borders.THIN
        borders.left = xlwt.Borders.THIN
        font.bold = False
        font_p.bold = True
        style_p.font = font
        style_pc.alignment = alignment_amt
        style_border.font = font_p
        fontbold.font = font_p
        fontbold.alignment = alignment_amt
        font_bold.font = font_p
        font_bold.alignment = alignment_lft
        style_border.alignment = alignment
        style_border.borders = borders
        workbook = xlwt.Workbook(encoding="utf-8")
        worksheet = workbook.add_sheet("Trial Balance")
        worksheet.col(0).width = 6500
        worksheet.col(1).width = 5600
        worksheet.col(2).width = 5600
        company_name = self.company_id.name
        if self.company_id.email:
            company_name += '\n' + self.company_id.email
        if self.company_id.phone:
            company_name += '\n' + self.company_id.phone
        worksheet.write_merge(0, 2, 0, 5, company_name, style=style_border)
        if self.display_account == 'all':
            display_account = "All"
        elif self.display_account == 'movement':
            display_account = 'With Movements'
        else:
            display_account = 'With balance is not equal to 0'
        worksheet.write_merge(3, 3, 0, 0, 'Display Account :', style_border)
        worksheet.write_merge(3, 3, 1, 2,
                              'Date From : ' + str(self.date_from) if self.date_from else '',
                              style_border)
        worksheet.write_merge(3, 3, 3, 5, 'Target Moves:', style_border)
        worksheet.write_merge(4, 4, 0, 0, display_account, style_border)
        worksheet.write_merge(4, 4, 1, 2, 'Date To: ' + str(self.date_to) if self.date_to else '',
                              style_border)
        worksheet.write_merge(4, 4, 3, 5,
                              'All Enteris' if self.target_move == 'all' else 'All Posted Entries',
                              style_border)
        worksheet.write_merge(5, 5, 0, 4)
        report_data = report_obj.with_context(active_model='tax.report.wiz')._get_report_values(
            self, data=datas)
        worksheet.write_merge(6, 6, 0, 0, 'Code', font_bold)
        worksheet.write_merge(6, 6, 1, 1, 'Account', font_bold)
        if self.include_init_balance:
            worksheet.write_merge(6, 6, 2, 2, 'Initial Balance', fontbold)
        num2 = 3 if self.include_init_balance else 2
        worksheet.write_merge(6, 6, num2, num2, 'Debit', fontbold)
        worksheet.write_merge(6, 6, num2 + 1, num2 + 1, 'Credit', fontbold)
        worksheet.write_merge(6, 6, num2 + 2, num2 + 2, 'Balance', fontbold)
        report_data = report_obj.with_context(active_model='tax.report.wiz')._get_report_values(
            self, data=datas)
        num = 7
        if report_data.get('Accounts'):
            for each in report_data['Accounts']:
                worksheet.write_merge(num, num, 0, 0, each['code'])
                worksheet.write_merge(num, num, 1, 1, each['name'])
                if each.get('init_bal'):
                    worksheet.write_merge(num, num, 2, 2, '%.2f' % each['init_bal'], style_pc)
                num2 = 3 if each.get('init_bal') else 2
                worksheet.write_merge(num, num, num2, num2, formatLang(
                    self.env, float(each['debit']),
                    currency_obj=self.env.user.company_id.currency_id),
                                      style_pc)
                worksheet.write_merge(num, num, num2 + 1, num2 + 1,
                                      formatLang(self.env, float(each['credit']),
                                                 currency_obj=self.env.user.company_id.currency_id),
                                      style_pc)
                worksheet.write_merge(num, num, num2 + 2, num2 + 2,
                                      formatLang(self.env, float(each['balance']),
                                                 currency_obj=self.env.user.company_id.currency_id),
                                      style_pc)
                num = num + 1
        file_data = io.BytesIO()
        workbook.save(file_data)
        self.write({
            'state': 'get',
            'data': base64.encodebytes(file_data.getvalue()),
            'name': 'trial_balance.xls'
        })
        return {
            'name': 'Trial Balance',
            'type': 'ir.actions.act_window',
            'res_model': 'trial.balance.wiz',
            'view_mode': 'form',
            'res_id': self.id,
            'target': 'new'
        }
