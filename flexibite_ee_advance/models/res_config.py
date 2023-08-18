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
import ast
from ast import literal_eval

from odoo import api, fields, models, _
from odoo.exceptions import ValidationError


class ResConfigSettings(models.TransientModel):
    _inherit = 'res.config.settings'

    # birthday reminder
    enable_birthday_reminder = fields.Boolean(string="Birthday Reminder")
    birthday_template_id = fields.Many2one('mail.template', string="Birthday Mail Template")
    # Anniversary reminder
    enable_anniversary_reminder = fields.Boolean(string="Anniversary Reminder")
    anniversary_template_id = fields.Many2one('mail.template', string="Anniversary Template")
    # Auto Close POS all session
    enable_auto_close_session = fields.Boolean(string="Automatic Close Session")
    # Generate Different Barcode and Unique Internal Ref.
    gen_barcode = fields.Boolean("On Product Create Generate Barcode")
    barcode_selection = fields.Selection(
        [
            ("code_39", "CODE 39"),
            ("code_128", "CODE 128"),
            ("ean_13", "EAN-13"),
            ("ean_8", "EAN-8"),
            ("isbn_13", "ISBN 13"),
            ("isbn_10", "ISBN 10"),
            ("issn", "ISSN"),
            ("upca", "UPC-A"),
        ],
        string="Select Barcode Type",
    )
    gen_internal_ref = fields.Boolean(
        string="On Product Create Generate Internal Reference"
    )
    # Product Expiry Code Start
    mailsend_check = fields.Boolean(string="Send Mail")
    email_notification_days = fields.Integer(string="Expiry Alert Days")
    res_user_ids = fields.Many2many('res.users', string='Users')

    @api.model
    def get_values(self):
        res = super(ResConfigSettings, self).get_values()
        param_obj = self.env['ir.config_parameter'].sudo()
        res.update({
            'enable_birthday_reminder': param_obj.get_param('flexibite_ee_advance.enable_birthday_reminder'),
            'birthday_template_id': int(param_obj.get_param('flexibite_ee_advance.birthday_template_id')),
            'enable_anniversary_reminder': param_obj.get_param('flexibite_ee_advance.enable_anniversary_reminder'),
            'anniversary_template_id': int(param_obj.get_param('flexibite_ee_advance.anniversary_template_id')),
            'enable_auto_close_session': param_obj.get_param('flexibite_ee_advance.enable_auto_close_session'),

            
            'gen_barcode': param_obj.get_param("flexibite_ee_advance.gen_barcode"),
            'barcode_selection': param_obj.get_param("flexibite_ee_advance.barcode_selection"),
            'gen_internal_ref': param_obj.get_param("flexibite_ee_advance.gen_internal_ref"),
        })
    
        # Product Expiry Dashboard Code Start
        res_user_ids = param_obj.get_param('flexibite_ee_advance.res_user_ids')
        if res_user_ids:
            res.update({'res_user_ids': ast.literal_eval(res_user_ids)})

        res.update(
            mailsend_check=param_obj.get_param('flexibite_ee_advance.mailsend_check'),
            email_notification_days=int(param_obj.get_param('flexibite_ee_advance.email_notification_days'))
        )
        # Product Expiry Dashboard Code End
        return res

    def set_values(self):
        param_obj = self.env['ir.config_parameter'].sudo()
        param_obj.set_param('flexibite_ee_advance.enable_birthday_reminder', self.enable_birthday_reminder)
        param_obj.set_param('flexibite_ee_advance.birthday_template_id', self.birthday_template_id.id)
        param_obj.set_param('flexibite_ee_advance.enable_anniversary_reminder',
                            self.enable_anniversary_reminder)
        param_obj.set_param('flexibite_ee_advance.anniversary_template_id', self.anniversary_template_id.id)
        param_obj.set_param('flexibite_ee_advance.enable_auto_close_session', self.enable_auto_close_session)

        # Generate Different Barcode and Unique Internal Ref.
        param_obj.set_param("flexibite_ee_advance.gen_barcode", self.gen_barcode)
        param_obj.set_param("flexibite_ee_advance.barcode_selection", self.barcode_selection)
        param_obj.set_param("flexibite_ee_advance.gen_internal_ref", self.gen_internal_ref)

        # Product Expiry Dashboard Code Start
        param_obj.set_param('flexibite_ee_advance.mailsend_check', self.mailsend_check)
        param_obj.set_param('flexibite_ee_advance.res_user_ids', self.res_user_ids.ids)
        param_obj.set_param('flexibite_ee_advance.email_notification_days', self.email_notification_days)
        # Product Expiry Dashboard Code End

        return super(ResConfigSettings, self).set_values()

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
