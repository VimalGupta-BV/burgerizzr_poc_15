# -*- coding: utf-8 -*-

from odoo import models,api, fields,_
from odoo.exceptions import UserError
import odoo.addons.decimal_precision as dp

class MrpProduction(models.Model):
    _inherit = 'mrp.production'
    _description = 'Estimate MRP Production'

    requisition_id=fields.Many2one('material.purchase.requisition', string="Material Request No.")