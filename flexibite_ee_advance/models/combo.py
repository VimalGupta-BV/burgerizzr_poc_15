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


class ProductCombo(models.Model):
    _name = 'product.combo'
    _description = 'Product Combo'

    def _add_domain(self):
        pos_product_ids = self.env['product.product'].search([('available_in_pos', '=', True)])
        if pos_product_ids:
            domain = [('id', 'in', pos_product_ids.ids)]
        else:
            domain = [('id', '=', -1)]
        return domain

    display_name = fields.Char('Display Name', required=True)
    product_tmpl_id = fields.Many2one('product.template')
    require = fields.Boolean("Required", help="Don't select it if you want to make it optional")
    pos_category_id = fields.Many2one('pos.category', "Categories")
    product_ids = fields.Many2many('product.product', string="Products", domain=_add_domain)
    no_of_items = fields.Integer("No. of Items", default=1)
    replaceable = fields.Boolean("Replaceable", help="Select it if you want to make it replaceable")
    base_price = fields.Integer("Base Price", default=0)


class PosComboLine(models.Model):
    _name = "pos.combo.line"
    _description = "Point of Sale Combo Lines"
    _rec_name = "product_id"

    product_id = fields.Many2one('product.product', string='Product', required=True, change_default=True)
    price = fields.Float(string='Unit Price', digits=0)
    qty = fields.Float('Quantity', digits='Product Unit of Measure', default=1)
    order_line_id = fields.Many2one('pos.order.line', string='Order Line Ref', ondelete='cascade', required=True)
    product_uom_id = fields.Many2one('uom.uom', string='Product UoM', related='product_id.uom_id')
    full_product_name = fields.Char('Full Product Name')
    categoryName = fields.Char('Category Name')
    categoryId = fields.Integer(string='Category Id')
    replaceable = fields.Boolean(string='Is replaceable')
    replacePrice = fields.Float(string='Replace Price', digits=0)
    customisePrice = fields.Float(string='Customise Price', digits=0)
    require = fields.Boolean(string='Is Require')
    max = fields.Float('Max Quantity', digits='Product Unit of Measure')
    is_replaced = fields.Boolean(string='Is Replaced')
    replaced_product_id = fields.Many2one('product.product', string='Replaced Product')


class ProductProduct(models.Model):
    _inherit = "product.product"

    @api.model
    def name_search(self, name, args=None, operator='ilike', limit=100):
        args = args
        if self._context.get('is_required', False):
            args += [['available_in_pos', '=', True]]
        if self._context.get('category_from_line', False):
            pos_category_id = self.env['pos.category'].browse(self._context.get('category_from_line'))
            args += [['pos_categ_id', 'child_of', pos_category_id.id], ['available_in_pos', '=', True]]
        return super(ProductProduct, self).name_search(name, args=args, operator='ilike', limit=100)
# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
