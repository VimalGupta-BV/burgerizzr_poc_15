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
from datetime import date

import xlwt
from odoo import fields, models, _
from odoo.exceptions import Warning
from odoo.tools.misc import formatLang


class AccountAgedPayableReportWizard(models.TransientModel):
    _name = "aged.payable"
    _description = "Account Aged Payable Report"

    start_date = fields.Date(string="Start Date", required=True, default=date.today())
    period_length = fields.Integer(string="Period Length (days)", required=True, default=30)
    target_move = fields.Selection([('posted', 'All Posted Entries'), ('all', 'All Entries')],
                                   string="Target Moves",
                                   default="posted")
    company_id = fields.Many2one('res.company', string='Company', readonly=True,
                                 default=lambda self: self.env.user.company_id)
    data = fields.Binary(string="Data")
    state = fields.Selection([('choose', 'choose'), ('get', 'get')], string="State",
                             default='choose')
    name = fields.Char(string='File Name', readonly=True)

    def generate_aged_payble(self):
        if self.period_length <= 0:
            raise Warning(_('You must set a period length greater than 0.'))

        data = {
            'ids': self.env.context.get('active_ids', []),
            'model': self.env.context.get('active_model', 'ir.ui.menu'),
            'form': self.read()[0]
        }
        datas = {
            'ids': self._ids,
            'docs': self._ids,
            'model': 'aged.payable',
            'form': data['form']
        }
        return self.env.ref('flexibite_ee_advance.report_aged_payble').report_action(self,
                                                                                      data=datas)

    def generated_aged_payable_xls(self):
        report_obj = self.env['report.flexibite_ee_advance.aged_payable_template']
        style_p = xlwt.XFStyle()
        style_pc = xlwt.XFStyle()
        style_border = xlwt.XFStyle()
        fontbold = xlwt.XFStyle()
        alignment = xlwt.Alignment()
        alignment.horz = xlwt.Alignment.HORZ_CENTER
        alignment_lft = xlwt.Alignment()
        alignment_lft.horz = xlwt.Alignment.HORZ_RIGHT
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
        style_pc.alignment = alignment_lft
        style_border.font = font_p
        fontbold.font = font_p
        style_border.alignment = alignment
        style_border.borders = borders
        workbook = xlwt.Workbook(encoding="utf-8")
        worksheet = workbook.add_sheet("Aged Payable")
        worksheet.col(0).width = 5600
        company_name = self.company_id.name
        if self.company_id.email:
            company_name += '\n' + self.company_id.email
        if self.company_id.phone:
            company_name += '\n' + self.company_id.phone
        worksheet.write_merge(0, 2, 0, 7, company_name, style=style_border)
        worksheet.col(3).width = 5000
        worksheet.write_merge(3, 3, 0, 7, 'Aged Payable', style=style_border)
        worksheet.write_merge(4, 4, 0, 0, 'Start Date :', style=style_border)
        worksheet.write_merge(4, 4, 1, 2, str(self.start_date), style=style_border)
        worksheet.write_merge(4, 4, 3, 3, "Period Length (days)", style=style_border)
        worksheet.write_merge(4, 4, 4, 5, self.period_length, style=style_border)
        worksheet.write_merge(5, 5, 0, 0, "Partner's:", style=style_border)
        worksheet.write_merge(5, 5, 1, 2, 'Payable Accounts', style=style_border)
        worksheet.write_merge(5, 5, 3, 3, "Target Moves:", style=style_border)
        worksheet.write_merge(5, 5, 4, 5,
                              'All Posted Entries' if self.target_move == 'posted'
                              else 'All Enteries',
                              style=style_border)
        worksheet.write_merge(6, 6, 0, 7, style=style_border)
        period_lenght = report_obj.get_time_interval(str(self.start_date), self.period_length)
        worksheet.write_merge(7, 7, 0, 0, 'Partners', style=style_border)
        worksheet.write_merge(7, 7, 1, 1, 'Not due', style=style_border)
        worksheet.write_merge(7, 7, 2, 2, period_lenght['4']['name'], style=style_border)
        worksheet.write_merge(7, 7, 3, 3, period_lenght['3']['name'], style=style_border)
        worksheet.write_merge(7, 7, 4, 4, period_lenght['2']['name'], style=style_border)
        worksheet.write_merge(7, 7, 5, 5, period_lenght['1']['name'], style=style_border)
        worksheet.write_merge(7, 7, 6, 6, period_lenght['0']['name'], style=style_border)
        worksheet.write_merge(7, 7, 7, 7, 'Total', style=style_border)
        accont_moveline, total, dummy = report_obj._get_partner_move_lines_custom(
            ['payable'],
            str(self.start_date),
            self.target_move,
            self.period_length)
        if total:
            worksheet.write_merge(8, 8, 0, 0, 'Account Total', style=fontbold)
            worksheet.write_merge(8, 8, 1, 1, formatLang(
                self.env, float(total[6]),
                currency_obj=self.env.user.company_id.currency_id),
                                  style=fontbold)
            worksheet.write_merge(8, 8, 2, 2, formatLang(
                self.env, float(total[4]),
                currency_obj=self.env.user.company_id.currency_id),
                                  style=fontbold)
            worksheet.write_merge(8, 8, 3, 3, formatLang(
                self.env, float(total[3]),
                currency_obj=self.env.user.company_id.currency_id),
                                  style=fontbold)
            worksheet.write_merge(8, 8, 4, 4, formatLang(
                self.env, float(total[2]),
                currency_obj=self.env.user.company_id.currency_id),
                                  style=fontbold)
            worksheet.write_merge(8, 8, 5, 5, formatLang(
                self.env, float(total[1]),
                currency_obj=self.env.user.company_id.currency_id),
                                  style=fontbold)
            worksheet.write_merge(8, 8, 6, 6, formatLang(
                self.env, float(total[0]),
                currency_obj=self.env.user.company_id.currency_id),
                                  style=fontbold)
            worksheet.write_merge(8, 8, 7, 7, formatLang(
                self.env, float(total[5]),
                currency_obj=self.env.user.company_id.currency_id),
                                  style=fontbold)
        num = 9
        for each in accont_moveline:
            worksheet.write_merge(num, num, 0, 0, each['name'])
            worksheet.write_merge(num, num, 1, 1, formatLang(
                self.env, float(each['direction']),
                currency_obj=self.env.user.company_id.currency_id),
                                  style_pc)
            worksheet.write_merge(num, num, 2, 2, formatLang(
                self.env, float(each['4']),
                currency_obj=self.env.user.company_id.currency_id),
                                  style_pc)
            worksheet.write_merge(num, num, 3, 3, formatLang(
                self.env, float(each['3']),
                currency_obj=self.env.user.company_id.currency_id),
                                  style_pc)
            worksheet.write_merge(num, num, 4, 4, formatLang(
                self.env, float(each['2']),
                currency_obj=self.env.user.company_id.currency_id),
                                  style_pc)
            worksheet.write_merge(num, num, 5, 5, formatLang(
                self.env, float(each['1']),
                currency_obj=self.env.user.company_id.currency_id),
                                  style_pc)
            worksheet.write_merge(num, num, 6, 6, formatLang(
                self.env, float(each['0']),
                currency_obj=self.env.user.company_id.currency_id),
                                  style_pc)
            worksheet.write_merge(num, num, 7, 7, formatLang(
                self.env, float(each['total']),
                currency_obj=self.env.user.company_id.currency_id),
                                  style_pc)
            num = num + 1
        file_data = io.BytesIO()
        workbook.save(file_data)
        self.write({
            'state': 'get',
            'data': base64.encodebytes(file_data.getvalue()),
            'name': 'aged_payable.xls'
        })
        return {
            'name': 'Aged Payable',
            'type': 'ir.actions.act_window',
            'res_model': 'aged.payable',
            'view_mode': 'form',
            'res_id': self.id,
            'target': 'new'
        }

# vim:expandtab:smartindent:tabstop=4
