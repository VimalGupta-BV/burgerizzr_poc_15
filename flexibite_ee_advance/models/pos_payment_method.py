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

from odoo import models, api, fields, _
from odoo.exceptions import UserError


class PosPaymentMethod(models.Model):
    _inherit = "pos.payment.method"

    @api.model
    def name_search(self, name, args=None, operator='ilike', limit=100):
        if self._context.get('config_id_cr_dr'):
            config_id = self.env['pos.config'].browse(self._context.get('config_id_cr_dr'))
            args += [['id', 'in', config_id.payment_method_ids.ids]]

        if self._context.get('config_jr'):
            if self._context.get('payment_method_ids') and \
                    self._context.get('payment_method_ids')[0] and \
                    self._context.get('payment_method_ids')[0][2]:
                args += [['id', 'in', self._context.get('payment_method_ids')[0][2]]]
            else:
                return False
        if self._context.get('from_delivery'):
            args += [['jr_use_for', '=', False]]
        return super(PosPaymentMethod, self).name_search(name, args=args, operator=operator, limit=limit)

    jr_use_for = fields.Selection([
        ('gift_card', "Gift Card"),
        ('gift_voucher', "Gift Voucher"),
        ('wallet', "Wallet"),
    ], string="Method Use For",
        help='This payment method reserve for particular feature, that accounting entry will manage based on assigned features.')

    @api.constrains('jr_use_for', 'split_transactions', 'journal_id')
    def _check_wallet_jr(self):
        for record in self:
            if record.jr_use_for == 'wallet' or record.jr_use_for == 'gift_card':
                if not record.split_transactions:
                    raise UserError(_('Please enable Identify Customer !'))
                if record.journal_id:
                    raise UserError(_('You can not select any journal in case of %s !') % record.name)
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
