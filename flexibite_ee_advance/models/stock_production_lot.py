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

from odoo import models, fields, api, _
from datetime import datetime, date


class StockProductionLot(models.Model):
    _inherit = 'stock.production.lot'

    remaining_qty = fields.Float("Remaining Qty", compute="_compute_remaining_qty")
    # Product Expiry Dashboard Code Start
    expiry_state = fields.Selection(
        [('expired', 'Expired'), ('near_expired', 'Near Expired')], string="State")
    product_expiry_reminder = fields.Boolean(
        compute='_compute_product_expiry_reminder', help="The Expiration Date has been reached.")

    @api.depends('alert_date')
    def _compute_product_expiry_reminder(self):
        current_date = fields.Datetime.now()
        for lot in self:
            if lot.alert_date and not lot.product_expiry_alert:
                lot.product_expiry_reminder = lot.alert_date <= current_date
            else:
                lot.product_expiry_reminder = False

    @api.onchange('expiration_date', 'alert_date')
    def onchange_state_check(self):
        """
        :return:
        """
        today_date = date.today()
        for rec in self:
            if rec.expiration_date and rec.expiration_date.date() < today_date:
                rec.expiry_state = 'expired'
            elif rec.alert_date and rec.alert_date.date() <= today_date:
                rec.expiry_state = 'near_expired'

    def update_all_expiry_state(self):
        """
        Update All Expiry
        :return:
        """
        today_date = date.today()
        for rec in self.search([]):
            if rec.expiration_date and rec.expiration_date.date() < today_date:
                rec.expiry_state = 'expired'
            elif rec.alert_date and rec.alert_date.date() <= today_date:
                rec.expiry_state = 'near_expired'

    @api.model
    def name_search(self, name, args=None, operator='=', limit=100):
        if self._context.get('default_product_id'):
            stock_production_lot_obj = self.env['stock.production.lot']
            args = args or []
            recs = self.search([('product_id', '=', self._context.get('default_product_id'))])
            if recs:
                for each_stock_lot in recs.filtered(lambda l: l.expiration_date).sorted(
                        key=lambda p: (p.expiration_date), reverse=False):
                    if each_stock_lot.expiration_date >= date.today():
                        stock_production_lot_obj |= each_stock_lot
                return stock_production_lot_obj.name_get()
        return super(StockProductionLot, self).name_search(name, args, operator, limit)

    # Product Expiry Dashboard Code End

    def _compute_remaining_qty(self):
        for each in self:
            each.remaining_qty = 0
            for quant_id in each.quant_ids:
                if quant_id and quant_id.location_id and quant_id.location_id.usage == 'internal':
                    each.remaining_qty += quant_id.quantity
        return

    def product_lot_and_serial(self, product_id, picking_type):
        picking_type_id = self.env['stock.picking.type'].browse(picking_type)
        domain = [('product_id', '=', product_id)]
        product_expiry_module_id = self.env['ir.module.module'].sudo().search([('name', '=', 'product_expiry')])
        if product_expiry_module_id.state == 'installed':
            domain += ('|', ('expiration_date', '>', datetime.utcnow().date().strftime("%Y-%m-%d")),
                       ('expiration_date', '=', False))
        lot_ids = self.env['stock.production.lot'].search_read(domain)
        for lot_id in lot_ids:
            quant_ids = self.env['stock.quant'].search([('id', 'in', lot_id.get('quant_ids')), (
                'location_id', '=', picking_type_id.default_location_src_id.id), ('on_hand', '=', True)])

            if quant_ids and quant_ids.quantity >= 0:
                lot_id.update({
                    'location_product_qty': quant_ids.quantity,
                    'visible': 'true',
                })
            else:
                lot_id.update({
                    'location_product_qty': 0,
                    'visible': 'false',
                })
        return lot_ids

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
