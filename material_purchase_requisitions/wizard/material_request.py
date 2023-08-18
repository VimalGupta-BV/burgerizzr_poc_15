# Copyright 2018-2019 ForgeFlow, S.L.
from datetime import datetime

from odoo import _, api, fields, models
from odoo.exceptions import UserError
from odoo.tools import get_lang


class WizardMaterialRequest(models.TransientModel):
    _name = "wizard.material.request"
    _description = "Material Request wizard"


    material_line_ids=fields.One2many('wizard.material.request.line','wz_request_id')
    mrp_production_id=fields.Many2one('mrp.production','WorkOrder No.')

    @api.model
    def default_get(self, fields):
        res = super().default_get(fields)
        active_model = self.env.context.get("active_model", False)
        
        request_line_ids = []
        line_id=[]
        request_ids = self.env.context.get("active_ids", False)
        print("WWWWWWWW",request_ids, self.env.context ,res)
        mrp_id=self.env['mrp.production'].search([('id','=',self.env.context.get('active_id'))])
        request_line_ids += (
         self.env[active_model].browse(request_ids).mapped("move_raw_ids")
            )
        #bom_id=self.env['mrp.bom'].search([('product_tmpl_id','=',mrp_id.move_raw_ids[0].product_id.product_tmpl_id.id)],limit=1)
        #for req in request_line_ids:
        #mrp_qty=sum(req.product_qty for req in request_line_ids)
        #for req in bom_id.bom_line_ids:for req in request_line_ids:
        for req in request_line_ids:
         line_id.append((0,0,{
            'product_id':req.product_id.id,
            'product_uom_qty':req.product_qty,
            'product_uom':req.product_uom.id,
            }))
       
        res['material_line_ids']=line_id
        res['mrp_production_id']=mrp_id.id

        return res

    def action_material_request(self):
        for rec in self:
            if rec.material_line_ids:
                employee_id=self.env['hr.employee'].search([('user_id','=',self.env.user.id)])
                vals={
                    'employee_id':employee_id.id or 1,
                    'department_id':employee_id.department_id.id or 1,
                    'request_date':fields.Datetime.now(),
                    'dest_location_id':rec.mrp_production_id.location_src_id.id,
                    'mrp_production_id':rec.mrp_production_id.id,

                }
                lines=[]
                for line in rec.material_line_ids:
                    lines.append((0,0,{
                            'product_id':line.product_id.id,
                            'description':line.product_id.display_name,
                            'qty':line.product_uom_qty,
                            'uom':line.product_uom.id,
                            'requisition_type':'internal'
                        }))

                vals.update({'requisition_line_ids':lines})

                requisition_id=self.env['material.purchase.requisition'].create(vals)
                rec.mrp_production_id.requisition_id=requisition_id.id
                print("requisition_idrequisition_idrequisition_id",requisition_id)




class WizardMaterialRequestLine(models.TransientModel):
    _name = "wizard.material.request.line"
    _description = "Material Request wizard line"


    wz_request_id=fields.Many2one('wizard.material.request')
    product_id=fields.Many2one('product.product', string="Product", required="1")
    product_uom=fields.Many2one('uom.uom', string="Unit", required="1")
    product_uom_qty=fields.Float('Quantity', required="1")
