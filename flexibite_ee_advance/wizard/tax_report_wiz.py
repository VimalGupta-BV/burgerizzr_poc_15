# -*- coding: utf-8 -*-

import base64
import io

import xlwt
from odoo import fields, models
from odoo.tools.misc import formatLang


class TaxReportWizard(models.TransientModel):
    _name = "tax.report.wiz"
    _description = "Tax Report"

    company_id = fields.Many2one('res.company', string='Company', readonly=True,
                                 default=lambda self: self.env.user.company_id)
    date_from = fields.Date(string='Start Date', required=True)
    date_to = fields.Date(string='End Date', required=True)
    data = fields.Binary(string="Data")
    state = fields.Selection([('choose', 'choose'), ('get', 'get')], string="State",
                             default='choose')
    name = fields.Char(string='File Name', readonly=True)

    def print_pdf(self):
        data = {
            'ids': self.env.context.get('active_ids', []),
            'model': self.env.context.get('active_model', 'ir.ui.menu'),
            'form': self.read(['date_from', 'date_to'])[0]}
        datas = {
            'ids': self._ids,
            'docs': self._ids,
            'model': 'tax.report.wiz',
            'form': data['form']
        }
        return self.env.ref('flexibite_ee_advance.report_tax').report_action(self, data=datas)

    def print_xls(self):
        report_obj = self.env['report.flexibite_ee_advance.tax_report_template']
        data = {
            'ids': self.env.context.get('active_ids', []),
            'model': self.env.context.get('active_model', 'ir.ui.menu'),
            'form': self.read(['date_from', 'date_to'])[0]}
        datas = {
            'ids': self._ids,
            'docs': self._ids,
            'model': 'tax.report.wiz',
            'form': data['form']
        }
        report_data = report_obj.with_context(active_model='tax.report.wiz')._get_report_values(
            self, data=datas)
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
        # style_pc.font = font_p
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
        worksheet.write_merge(4, 4, 0, 2, 'Tax Report', style_border)
        worksheet.write_merge(5, 5, 1, 1, 'Net', text_right)
        worksheet.write_merge(5, 5, 2, 2, 'Tax', text_right)
        num = 6
        if report_data.get('lines'):
            for each in report_data.get('lines'):
                worksheet.write_merge(num, num, 0, 2, each, fontbold)
                num = num + 1
                if report_data.get('lines').get(each):
                    for each in report_data.get('lines')[each]:
                        worksheet.write_merge(num, num, 0, 0, each.get('name'))
                        worksheet.write_merge(num, num, 1, 1, formatLang(
                            self.env, float(each.get('net')),
                            currency_obj=self.env.user.company_id.currency_id),
                                              style_pc)
                        worksheet.write_merge(num, num, 2, 2, formatLang(
                            self.env, float(each.get('tax')),
                            currency_obj=self.env.user.company_id.currency_id),
                                              style_pc)
                        num = num + 1
        file_data = io.BytesIO()
        workbook.save(file_data)
        self.write({
            'state': 'get',
            'data': base64.encodebytes(file_data.getvalue()),
            'name': 'tax_report.xls'
        })
        return {
            'name': 'Tax Report',
            'type': 'ir.actions.act_window',
            'res_model': 'tax.report.wiz',
            'view_mode': 'form',
            'res_id': self.id,
            'target': 'new'
        }
