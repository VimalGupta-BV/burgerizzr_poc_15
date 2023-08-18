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

import psycopg2
import pytz
from functools import partial
from odoo import models, fields, api, tools, _
from odoo.tools import float_is_zero, float_round
from datetime import timedelta, datetime, timezone
from odoo.exceptions import UserError
from itertools import groupby
import logging

_logger = logging.getLogger(__name__)

line_state = {'Waiting': 1, 'Preparing': 2, 'Delivering': 3, 'Done': 4}


def start_end_date_global(start, end, tz):
    tz = pytz.timezone(tz) or 'UTC'
    current_time = datetime.now(tz)
    hour_tz = int(str(current_time)[-5:][:2])
    min_tz = int(str(current_time)[-5:][3:])
    sign = str(current_time)[-6][:1]
    if sign == '-':
        start_date = (datetime.strptime(start, '%Y-%m-%d %H:%M:%S') + timedelta(hours=hour_tz,
                                                                                minutes=min_tz)).strftime(
            "%Y-%m-%d %H:%M:%S")
        end_date = (datetime.strptime(end, '%Y-%m-%d %H:%M:%S') + timedelta(hours=hour_tz,
                                                                            minutes=min_tz)).strftime(
            "%Y-%m-%d %H:%M:%S")
    if sign == '+':
        start_date = (datetime.strptime(start, '%Y-%m-%d %H:%M:%S') - timedelta(hours=hour_tz,
                                                                                minutes=min_tz)).strftime(
            "%Y-%m-%d %H:%M:%S")
        end_date = (datetime.strptime(end, '%Y-%m-%d %H:%M:%S') - timedelta(hours=hour_tz,
                                                                            minutes=min_tz)).strftime(
            "%Y-%m-%d %H:%M:%S")
    return start_date, end_date


class PosOrder(models.Model):
    _inherit = 'pos.order'

    @api.depends('amount_total', 'amount_paid')
    def _compute_amount_due(self):
        for each in self:
            each.amount_due = (each.amount_total - each.amount_paid) + each.change_amount_for_wallet

    change_amount_for_wallet = fields.Float('Wallet Amount')  # store wallet amount
    amount_due = fields.Float("Amount Due", compute="_compute_amount_due")
    earned_points = fields.Integer('Earned Points', readonly="1")
    redeem_points = fields.Integer('Redeem Points', readonly="1")
    points_amount = fields.Integer('Points Amount', readonly="1")
    ref_reward = fields.Integer('Reference Points', readonly="1")
    ref_customer = fields.Integer('Reference Customer', readonly="1")
    back_order_reference = fields.Char('Back Order Receipt', readonly="1")
    signature = fields.Binary(string="Signature")
    rating = fields.Selection(
        [('0', 'No Ratings'), ('1', 'Bad'), ('2', 'Not bad'), ('3', 'Good'), ('4', 'Very Good'), ('5', 'Excellent')],
        'Rating', default='0', index=True)

    is_delivery_charge = fields.Boolean(string="Is Delivery Charge")
    delivery_user_id = fields.Many2one("res.users", string="Delivery User")
    delivery_date = fields.Datetime("Delivery Date")
    delivery_address = fields.Char("Delivery Address")
    delivery_charge_amt = fields.Float("Delivery Charge")
    delivery_type = fields.Selection([
        ('none', 'None'),
        ('pending', 'Pending'),
        ('delivered', 'Delivered')],
        string="Delivery Type", default="none")
    pos_return_order = fields.Integer(compute='_compute_pos_return_order_count')
    remaining_lines = fields.One2many('pos.order.line', 'order_id', string='Remaining Order Lines',
                                      states={'draft': [('readonly', False)]}, readonly=True, copy=True)
    order_state = fields.Selection(
        [("Start", "Start"), ("Done", "Done"), ("Deliver", "Deliver"), ("Complete", "Complete")], default="Start")
    # line_cancel_reason_ids = fields.One2many('order.line.cancel.reason', 'pos_order_id', string="Line Cancel Reason")
    waiter_id = fields.Many2one('res.users', string="Waiter", readonly=True)
    cancel_order_reason = fields.Text('Cancel Reason', readonly=True)
    send_to_kitchen = fields.Boolean('Send Order To Kitchen', readonly=True)
    order_type = fields.Selection([('Dine In', 'Dine In'), ('Take Away', 'Take Away'), ('Delivery', 'Delivery')],
                                  string="Order Type")
    delivery_service_id = fields.Many2one('pos.delivery.service', string="Delivery Service")



    def _compute_pos_return_order_count(self):
        for order in self:
            order_id_count = self.search_count([('back_order_reference', '=', order.pos_reference)])
            order.pos_return_order = order_id_count

    def action_pos_return_order(self):
        self.ensure_one()
        action = self.env['ir.actions.act_window']._for_xml_id('point_of_sale.action_pos_pos_form')
        action['context'] = {}
        action['domain'] = [('back_order_reference', '=', self.pos_reference)]
        return action

    def check_order_delivery_type(self):
        if self.delivery_type == 'pending' and self.state == 'paid':
            self.write({'delivery_type': 'delivered'})
            self.picking_ids._action_done()
            return {'type': 'ir.actions.client', 'tag': 'reload'}

    def _export_for_ui(self, order):
        timezone = pytz.timezone(self._context.get('tz') or self.env.user.tz or 'UTC')
        return {
            'lines': [[0, 0, line] for line in order.lines.export_for_ui()],
            'statement_ids': [[0, 0, payment] for payment in order.payment_ids.export_for_ui()],
            'name': order.pos_reference,
            'uid': order.pos_reference[6:],
            'amount_paid': order.amount_paid,
            'amount_total': order.amount_total,
            'amount_tax': order.amount_tax,
            'amount_return': order.amount_return,
            'pos_session_id': order.session_id.id,
            'is_session_closed': order.session_id.state == 'closed',
            'pricelist_id': order.pricelist_id.id,
            'partner_id': order.partner_id.id,
            'user_id': order.user_id.id,
            'sequence_number': order.sequence_number,
            'creation_date': order.date_order.astimezone(timezone),
            'fiscal_position_id': order.fiscal_position_id.id,
            'to_invoice': order.to_invoice,
            'to_ship': order.to_ship,
            'state': order.state,
            'account_move': order.account_move.id,
            'id': order.id,
            'is_tipped': order.is_tipped,
            'order_note': order.note,
            'tip_amount': order.tip_amount,
        }

    @api.model
    def _process_order(self, order, draft, existing_order):
        """Create or update an pos.order from a given dictionary.
        :param dict order: dictionary representing the order.
        :param bool draft: Indicate that the pos_order is not validated yet.
        :param existing_order: order to be updated or False.
        :type existing_order: pos.order.
        :returns: id of created/updated pos.order
        :rtype: int
        """
        order = order['data']
        pos_session = self.env['pos.session'].browse(order['pos_session_id'])
        if pos_session.state == 'closing_control' or pos_session.state == 'closed':
            order['pos_session_id'] = self._get_valid_session(order).id

        pos_order = False
        if not existing_order:
            pos_order = self.create(self._order_fields(order))
        else:
            pos_order = existing_order
            pos_order.lines.unlink()
            order['user_id'] = pos_order.user_id.id
            pos_order.write(self._order_fields(order))

        pos_order = pos_order.with_company(pos_order.company_id)
        self = self.with_company(pos_order.company_id)
        self._process_payment_lines(order, pos_order, pos_session, draft)

        if not draft:
            try:
                pos_order.action_pos_order_paid()
            except psycopg2.DatabaseError:
                # do not hide transactional errors, the order(s) won't be saved!
                raise
            except Exception as e:
                _logger.error('Could not fully process the POS Order: %s', tools.ustr(e))
        if order.get('get_delivery_charge_data') and order.get('get_delivery_charge'):
            get_delivery_data = order.get('get_delivery_charge_data')
            get_delivery_charge = order.get('get_delivery_charge_data')
            time = '00:00'
            if get_delivery_data.get('DeliveryTime'):
                time = get_delivery_data.get('DeliveryTime')
            delivery_datetime_str = get_delivery_data.get('DeliveryDate') + " " + time + ":00"
            local = pytz.timezone(self.env.user.tz)
            delivery_datetime = datetime.strptime(delivery_datetime_str, "%Y-%m-%d %H:%M:%S")
            local_dt = local.localize(delivery_datetime, is_dst=None)
            utc_dt = local_dt.astimezone(pytz.utc)
            dt_string = str(utc_dt)
            new_dt = dt_string[:19]
            utc_delivery_datetime = datetime.strptime(new_dt, '%Y-%m-%d %H:%M:%S')
            vals = {
                'is_delivery_charge': get_delivery_data.get('IsDeliveryCharge'),
                'delivery_user_id': int(get_delivery_data.get('DeliveryUser')),
                'delivery_date': utc_delivery_datetime,
                'delivery_address': get_delivery_data.get('CustomerAddress'),
                'delivery_charge_amt': get_delivery_charge.get('amount'),
                'delivery_type': 'pending',
            }
            pos_order.write(vals)
        pos_order._create_order_picking()
        pos_order._compute_total_cost_in_real_time()

        if pos_order.to_invoice and pos_order.state == 'paid':
            pos_order.action_pos_order_invoice()

        if pos_order:
            if order['wallet_type']:
                self.wallet_management(order, pos_order)
            if order.get('giftcard') or order.get('redeem') or order.get('recharge'):
                self.gift_card_management(order, pos_order)
            if order.get('voucher_redeem'):
                self.gift_voucher_management(order)
            # if order.get('partner_id') and pos_order:
                # self.loyalty_management(order, pos_order)
        if order and order.get('data') and order.get('data').get('delete_product') and order.get('data').get(
                'server_id') and order.get('data').get('cancel_product_reason'):
            order_id = self.browse(order.get('data').get('server_id'))
            reason = order.get('data').get('cancel_product_reason')
            order_id.write({
                'line_cancel_reason_ids': [(0,0,{
                    'pos_order_id': order_id.id,
                    'product_id': reason.get('product'),
                    'reason': reason.get('reason_id'),
                    'description': reason.get('description'),
                })],
            })
        if order.get('send_to_kitchen') or not order.get('table_id'):
            self.broadcast_order_data(True)
        return pos_order.id

    @api.model
    def cancel_pos_order(self, order_id, cancel_reason):
        order_obj = self.browse(order_id)
        order_obj.write({'state': 'cancel', 'cancel_order_reason': cancel_reason or ''})
        self.broadcast_order_data(False)
        return True

    def broadcast_order_vals(self, pos_order):
        screen_table_data = []
        for order in pos_order:
            order_line_list = []
            for line in order.lines:
                if not line.is_combo_line:
                    combo_line_list = []
                    for comboline in line.combo_lines:
                        combo_line = {
                            'id': comboline.id,
                            'name': comboline.product_id.display_name,
                            'qty': comboline.qty,
                        }
                        combo_line_list.append(combo_line)

                # if line.state == 'Waiting':
                #     order.order_state = 'Start'
                    order_line = {
                        'id': line.id,
                        'order_id': order.id,
                        'line_cid': line.line_cid,
                        'name': line.product_id.display_name,
                        'full_product_name': line.full_product_name,
                        'line_note': line.note,
                        'qty': line.qty,
                        'bom_id':lie.bom_id.id,
                        'table': line.order_id.table_id.name,
                        'floor': line.order_id.table_id.floor_id.name,
                        'state': line.state,
                        'categ_id': line.product_id.product_tmpl_id.pos_categ_id.id,
                        'order_name': line.order_id.name,
                        'user': line.create_uid.id,
                        'route_id': line.product_id.product_tmpl_id.route_ids.active,
                    }
                    order_line_list.append(order_line)
            order_dict = {
                'order_id': order.id,
                'order_name': order.name,
                'order_reference': order.pos_reference,
                'order_time': order.date_order,
                'table': order.table_id.name,
                'floor': order.table_id.floor_id.name,
                'customer': order.partner_id.name,
                'order_lines': order_line_list,
                'total': order.amount_total,
                'note': order.note,
                'state': order.state,
                'user_id': order.user_id.id,
                'user_name': order.user_id.name,
                'guests': order.customer_count,
                'order_state': order.order_state,
                'order_type': order.order_type,
            }
            screen_table_data.append(order_dict)
        return screen_table_data

    def convert_end_time(self, end_datetime):
        return pytz.utc.localize(end_datetime).isoformat()

    def get_broadcast_order_data(self):
        order_line_list = []
        for line in self.lines:
            # combo_line_list = []
            if not line.is_combo_line:
                combo_line_list = []
                for comboline in line.combo_lines:
                    combo_line = {
                        'id': comboline.id,
                        'name': comboline.product_id.display_name,
                        'qty': comboline.qty,
                    }
                    combo_line_list.append(combo_line)
                order_line = {
                    'id': line.id,
                    'order_id': self.id,
                    'line_cid': line.line_cid,
                    'name': line.product_id.display_name,
                    'full_product_name': line.full_product_name,
                    'note': line.note,
                    'qty': line.qty,
                    'bom_id':line.bom_id.id,
                    'table': line.order_id.table_id.name,
                    'floor': line.order_id.table_id.floor_id.name,
                    'state': line.state,
                    'categ_id': line.product_id.product_tmpl_id.pos_categ_id.id,
                    'order_name': line.order_id.name,
                    'user': line.create_uid.id,
                    'route_id': line.product_id.product_tmpl_id.route_ids.active,
                    'combolines': combo_line_list,
                }
                order_line_list.append(order_line)
        return {
            'order_id': self.id,
            'order_name': self.name,
            'pos_reference': self.pos_reference,
            'order_time': self.convert_end_time(self.date_order),
            'table': self.table_id.name,
            'floor': self.table_id.floor_id.name,
            'customer': self.partner_id.name,
            'order_lines': order_line_list,
            'total': self.amount_total,
            'note': self.note,
            'state': self.state,
            'user_id': self.user_id.id,
            'user_name': self.user_id.name,
            'guests': self.customer_count,
            'order_state': self.order_state,
            'order_type': self.order_type,
        }

    @api.model
    def broadcast_order_data(self, new_order):
        pos_order = self.search([('lines.state', 'not in', ['cancel', 'done']),
                                 ('amount_total', '>', 0.00)])
        screen_table_data = []
        for order in pos_order:
            order_dict = order.get_broadcast_order_data()
            screen_table_data.append(order_dict)
        screen_table_data = screen_table_data[::-1]
        kitchen_user_ids = self.env['res.users'].search([('kitchen_screen_user', 'in', ['cook', 'manager', 'waiter'])])
        notifications = []
        if kitchen_user_ids:
            for kitchen_user_id in kitchen_user_ids:
                notify_data = {
                    'screen_display_data': screen_table_data,
                    'new_order': new_order,
                    'manager': False if kitchen_user_id.kitchen_screen_user == 'cook' else True
                }
                notifications.append([kitchen_user_id.partner_id, 'pos.order/kitchen_screen', notify_data])
        if notifications:
            self.env['bus.bus']._sendmany(notifications)
        return screen_table_data

    def _create_order_picking(self):
        self.ensure_one()
        if self.is_delivery_charge:
            picking_type = self.config_id.picking_type_id
            if self.partner_id.property_stock_customer:
                destination_id = self.partner_id.property_stock_customer.id
            elif not picking_type or not picking_type.default_location_dest_id:
                destination_id = self.env['stock.warehouse']._get_partner_locations()[0].id
            else:
                destination_id = picking_type.default_location_dest_id.id

            pickings = self.env['stock.picking']._create_picking_from_pos_order_lines(destination_id, self.lines,
                                                                                      picking_type, self.partner_id,
                                                                                      self.is_delivery_charge)
            pickings.write({'pos_session_id': self.session_id.id, 'pos_order_id': self.id, 'origin': self.name})

        if (not self.is_delivery_charge and not self.session_id.update_stock_at_closing) or (
                self.company_id.anglo_saxon_accounting and self.to_invoice and not self.is_delivery_charge):
            picking_type = self.config_id.picking_type_id
            if self.partner_id.property_stock_customer:
                destination_id = self.partner_id.property_stock_customer.id
            elif not picking_type or not picking_type.default_location_dest_id:
                destination_id = self.env['stock.warehouse']._get_partner_locations()[0].id
            else:
                destination_id = picking_type.default_location_dest_id.id

            pickings = self.env['stock.picking']._create_picking_from_pos_order_lines(destination_id, self.lines,
                                                                                      picking_type, self.partner_id)
            pickings.write({'pos_session_id': self.session_id.id, 'pos_order_id': self.id, 'origin': self.name})

    def action_pos_order_paid(self):
        self.ensure_one()
        if self.config_id.enable_wallet:
            if not self.config_id.cash_rounding:
                total = self.amount_total
            else:
                total = float_round(0, precision_rounding=self.config_id.rounding_method.rounding,
                                    rounding_method=self.config_id.rounding_method.rounding_method)
            if not float_is_zero(0, precision_rounding=self.currency_id.rounding):
                raise UserError(_("Order %s is not fully paid.", self.name))

            self.write({'state': 'paid'})
        result = super(PosOrder, self).action_pos_order_paid()
        if result:
            kitchen_user_ids = self.env['res.users'].search([('kitchen_screen_user', 'in', ['waiter', 'manager'])])
            notifications = []
            if kitchen_user_ids:
                for kitchen_user_id in kitchen_user_ids:
                    notify_data = {
                        'remove_order': self.id,
                    }
                    notifications.append([kitchen_user_id.partner_id, 'pos.order/kitchen_screen', notify_data])
            if notifications:
                self.env['bus.bus']._sendmany(notifications)
        return result

    def _get_fields_for_draft_order(self):
        res = super(PosOrder, self)._get_fields_for_draft_order()
        if isinstance(res, list):
            res.append('order_state')
            res.append('waiter_id')
            res.append('order_type')
        return res

    def _get_fields_for_order_line(self):
        res = super(PosOrder, self)._get_fields_for_order_line()
        if isinstance(res, list):
            res.append('state')
            res.append('line_cid')
        res.append('is_combo_line')
        res.append('quantityLine')
        res.append('useQuantityLine', )
        rec.append('bom_id')
        return res

    def _get_order_lines(self, orders):
        order_lines = self.env['pos.order.line'].search_read(
            domain=[('order_id', 'in', [to['id'] for to in orders])],
            fields=self._get_fields_for_order_line())
        if order_lines:
            self._get_pack_lot_lines(order_lines)
            # self._get_material_lines(order_lines)
            self._get_combo_lines(order_lines)

        extended_order_lines = []
        for order_line in order_lines:
            if not order_line['is_combo_line']:
                order_line['product_id'] = order_line['product_id'][0]
                order_line['server_id'] = order_line['id']
                order_line['quantityLine'] = eval(order_line['quantityLine'])
                order_line['useQuantityLine'] = eval(order_line['useQuantityLine'])
                del order_line['id']
                if 'pack_lot_ids' not in order_line:
                    order_line['pack_lot_ids'] = []
                # if 'material_lines' not in order_line:
                #     order_line['material_lines'] = []
                if 'combo_lines' not in order_line:
                    order_line['combo_lines'] = []
                extended_order_lines.append([0, 0, order_line])

        for order_id, order_lines in groupby(extended_order_lines, key=lambda x: x[2]['order_id']):
            next(order for order in orders if order['id'] == order_id[0])['lines'] = list(order_lines)

    def gift_voucher_management(self, data):
        voucher_redeem_details = data.get('voucher_redeem')
        self.env['aspl.gift.voucher.redeem'].create(voucher_redeem_details)

    def gift_card_management(self, data, pos_order_id):
        for create_details in data.get('giftcard'):
            if create_details.get("expire_date") and create_details.get("customer_id"):
                self.env['aspl.gift.card'].create(create_details)
        if data.get('redeem') and pos_order_id:
            redeem_details = data.get('redeem')
            redeem_vals = {
                'pos_order_id': pos_order_id.id,
                'order_date': pos_order_id.date_order,
                'customer_id': redeem_details.get('card_customer_id') or False,
                'card_id': redeem_details.get('redeem_card_no'),
                'amount': redeem_details.get('redeem_card_amount'),
            }
            use_giftcard = self.env['aspl.gift.card.use'].create(redeem_vals)
            if use_giftcard:
                use_giftcard.card_id.write({'card_value': use_giftcard.card_id.card_value - use_giftcard.amount})

        # recharge giftcard
        if data.get('recharge'):
            recharge_details = data.get('recharge')
            recharge_vals = {
                'user_id': pos_order_id.user_id.id,
                'recharge_date': pos_order_id.date_order,
                'customer_id': recharge_details.get('card_customer_id') or False,
                'card_id': recharge_details.get('recharge_card_id'),
                'amount': recharge_details.get('recharge_card_amount'),
            }
            recharge_giftcard = self.env['aspl.gift.card.recharge'].create(recharge_vals)
            if recharge_giftcard:
                recharge_giftcard.card_id.write(
                    {'card_value': recharge_giftcard.card_id.card_value + recharge_giftcard.amount})

    def wallet_management(self, data, pos_order_id):
        if data.get('change_amount_for_wallet'):
            session_id = pos_order_id.session_id
            cash_register_id = session_id.cash_register_id
            if not cash_register_id:
                raise UserError(_('There is no cash register for this PoS Session'))
            cash_bocx_out_obj = self.env['cash.box.out'].create(
                {'name': 'Credit', 'amount': data.get('change_amount_for_wallet')})
            cash_bocx_out_obj.with_context({'partner_id': pos_order_id.partner_id.id})._run(cash_register_id)
            vals = {
                'customer_id': pos_order_id.partner_id.id,
                'type': data.get('wallet_type'),
                'order_id': pos_order_id.id,
                'credit': data.get('change_amount_for_wallet'),
                'cashier_id': data.get('user_id'),
            }
            self.env['wallet.management'].create(vals)
        elif data.get('used_amount_from_wallet'):
            vals = {
                'customer_id': pos_order_id.partner_id.id,
                'type': data.get('wallet_type'),
                'order_id': pos_order_id.id,
                'debit': data.get('used_amount_from_wallet'),
                'cashier_id': data.get('user_id'),
            }
            self.env['wallet.management'].create(vals)
        else:
            vals = {
                'customer_id': pos_order_id.partner_id.id,
                'order_id': pos_order_id.id,
                'credit': data.get('lines')[0][2].get('price_subtotal_incl'),
                'cashier_id': data.get('user_id'),
            }
            self.env['wallet.management'].create(vals)

    def _order_fields(self, ui_order):
        new_order_line = []
        state_list = []
        process_line = partial(self.env['pos.order.line']._order_line_fields, session_id=ui_order['pos_session_id'])
        for line in ui_order['lines']:
            combo_lines = []
            for comboline in line[2]['combolines']:
                comboline['price_subtotal'] = 0
                comboline['price_unit'] = 0
                comboline['price_subtotal_incl'] = 0
                comboline['tax_ids'] = [(6, 0, [])]
                comboline.update({'is_combo_line': True})
                new_order_line.append([0, 0, comboline])
                combo_lines.append([0, 0, {'product_id': comboline['product_id'],
                                           'qty': comboline['qty'],
                                           'price': comboline['price_unit'],
                                           'full_product_name': comboline['full_product_name'],
                                           # 'material_lines': comboline['material_lines'],
                                           # 'bom_id': comboline['bom_id'],
                                           'categoryName': comboline['categoryName'],
                                           'categoryId': comboline['categoryId'],
                                           'replaceable': comboline['replaceable'],
                                           'replacePrice': comboline['replacePrice'],
                                           'customisePrice': comboline['customisePrice'],
                                           'require': comboline['require'],
                                           'max': comboline['max'],
                                           'is_replaced': comboline['is_replaced'],
                                           'replaced_product_id': comboline['replaced_product_id'],
                                           }])
            new_order_line.append(line)
            line[2].update({'combo_lines': combo_lines})
            state_list.append(line[2]['state'])
        if 'Waiting' in state_list:
            order_state = 'Start'
        elif 'Preparing' in state_list:
            order_state = 'Done'
        else:
            order_state = 'Deliver'

        if ui_order.get('is_from_sync_screen') and ui_order.get('server_id'):
            order = self.browse(ui_order.get('server_id'))
            if order and order.table_id:
                ui_order.update({'table_id': order.table_id.id})
        ui_order['waiter_id'] = ui_order.get('waiter_id')
        res = super(PosOrder, self)._order_fields(ui_order)
        if ui_order and ui_order.get('refund_order') and ui_order.get('refund_ref_order') and ui_order.get(
                'refund_ref_order'):
            reference_order_id = self.search([('pos_reference', '=', ui_order.get('refund_ref_order').get('name'))],
                                             limit=1)
            for line in ui_order.get('refund_ref_order').get('lines'):
                reference_order_line_id = self.env['pos.order.line'].browse(line[2].get('id'))
                if reference_order_line_id:
                    if line[2].get('return_qty'):
                        quantity = reference_order_line_id.order_return_qty - float(line[2].get('return_qty'))
                    else:
                        quantity = reference_order_line_id.order_return_qty
                    reference_order_line_id.order_return_qty = quantity
                    return_lot_name = []
                    if line[2].get('select_operation_lot_name'):
                        for lot_line in line[2].get('select_operation_lot_name'):
                            return_lot_name.append(lot_line.get('lot_name'))
                        return_lot_ids = reference_order_line_id.mapped('return_pack_lot_ids').filtered(
                            lambda lot: lot.lot_name in return_lot_name)
                        for return_lot_id in return_lot_ids:
                            reference_order_line_id.return_pack_lot_ids = [(3, return_lot_id.id)]
                        reference_order_line_id._onchange_qty()
                        reference_order_line_id._onchange_amount_line_all()

            res.update({
                'name': reference_order_id.name + " REFUND",
                'back_order_reference': ui_order.get('refund_ref_order').get('name'),
            })
        if ui_order and ui_order.get('delivery_service') and ui_order.get('delivery_service').get(
                'id') and ui_order.get('order_type') and ui_order.get('order_type') == 'Delivery':
            res.update({
                'delivery_service_id': ui_order.get('delivery_service').get('id')
            })
        res.update({
            'lines': [process_line(l) for l in new_order_line] if new_order_line else False,
            'order_type': ui_order.get('order_type') or False,
            'order_state': ui_order['order_state'] or False,
            'change_amount_for_wallet': ui_order.get('change_amount_for_wallet') or 0.00,
            'amount_due': ui_order.get('amount_due'),
            'note': ui_order.get('order_note', False),
            'user_id': ui_order['cashier_id'] or False,
            'signature': ui_order.get('sign') or False,
            'rating': str(ui_order.get('rating')),
            'send_to_kitchen': ui_order['send_to_kitchen'] or False,
        })
        return res

    def _get_fields_for_combo_line(self):
        return [
            'id',
            'product_id',
            'price',
            'order_line_id',
            'qty',
            'max',
            'categoryName',
            'categoryId',
            'full_product_name',
            'require',
            'replaceable',
            'replacePrice',
            'customisePrice',
            'is_replaced',
            'replaced_product_id',
        ]

    def _get_combo_lines(self, order_lines):
        combo_lines = self.env['pos.combo.line'].search_read(
            domain=[('order_line_id', 'in', [order_line['id'] for order_line in order_lines])],
            fields=self._get_fields_for_combo_line())

        extended_combo_lines = []
        for combo_line in combo_lines:
            combo_line['order_line'] = combo_line['order_line_id'][0]
            combo_line['product_id'] = combo_line['product_id'][0]
            combo_line['replaced_product_id'] = combo_line['replaced_product_id'][0] if combo_line[
                'replaced_product_id'] else False
            combo_line['server_id'] = combo_line['id']
            del combo_line['order_line_id']
            del combo_line['id']
            extended_combo_lines.append(combo_line)
        for order_line_id, combo_lines in groupby(extended_combo_lines, key=lambda x: x['order_line']):
            next(order_line for order_line in order_lines if order_line['id'] == order_line_id)['combo_lines'] = list(
                combo_lines)

    def unlink(self):
        cashier = self.env['res.users'].search([('sales_persons', 'in', [self.salesman_id.id])]).ids
        cashier.append(self.salesman_id.id)
        for user in cashier:
            session = self.env['pos.session'].search([('user_id', '=', user)], limit=1)
            if session:
                notifications = []
                notify_data = {
                    'cancelled_order': self.read(),
                }
                notifications.append([user, 'pos.order/cancelled_order', notify_data])
                if notifications:
                    self.env['bus.bus']._sendmany(notifications)
        return super(PosOrder, self).unlink()

    def write(self, vals):
        for order in self:
            if order.name == '/':
                vals['name'] = order.config_id.sequence_id._next()
        return super(PosOrder, self).write(vals)

    @api.model
    def get_customer_product_history(self, product_id, partner_id):
        sql = """
            SELECT 
                po.name,
                pol.product_id,to_char(po.date_order, 'DD-MM-YYYY') AS date_order,
                pol.price_subtotal_incl AS total, 
                pol.qty ,
                uom.name AS uom_name 
            FROM 
                pos_order AS po
                LEFT JOIN pos_order_line AS pol ON pol.order_id = po.id 
                LEFT JOIN uom_uom AS uom ON pol.uom_id = uom.id 
            WHERE 
                pol.product_id = %s AND 
                po.partner_id = %s AND
                po.back_order_reference is null or po.back_order_reference = ''
            ORDER BY 
                po.date_order Desc 
            LIMIT 1
            """ % (product_id, partner_id)
        self.env.cr.execute(sql)
        res_all = self.env.cr.dictfetchall()
        return res_all

    @api.model
    def get_all_product_history(self, product_ids, partner_id):
        sql = """
            SELECT 
                po.name, 
                po.partner_id, 
                pol.product_id,
                pol.qty, 
                uom.name AS uom_name ,
                pol.price_subtotal_incl, 
                to_char(po.date_order, 'DD-MM-YYYY') AS date_order 
            FROM 
                pos_order_line AS pol
                INNER JOIN pos_order AS po ON po.id = pol.order_id 
                INNER JOIN uom_uom AS uom ON pol.uom_id = uom.id 
            WHERE 
                po.date_order = ( 
                    SELECT MAX (date_order) 
                    FROM pos_order 
                    WHERE partner_id IN ('%s'))
                and po.back_order_reference is null or po.back_order_reference = ''
            """ % partner_id
        self.env.cr.execute(sql)
        res_all_last_purchase_history = self.env.cr.dictfetchall()
        if res_all_last_purchase_history:
            res_single_date_purchase_history = res_all_last_purchase_history[0].get('date_order')
            res_single_order_name_purchase_history = res_all_last_purchase_history[0].get('name')
            sql = """
                SELECT 
                    DISTINCT ON (pol.product_id) pol.product_id, 
                    to_char(po.date_order, 'DD-MM-YYYY') AS date_order, 
                    pol.qty, 
                    po.name, 
                    uom.name AS uom_name,
                    Round(pol.price_subtotal_incl,2) AS price_subtotal_incl 
                FROM 
                    pos_order_line AS pol
                    INNER JOIN uom_uom AS uom ON pol.uom_id = uom.id 
                    INNER JOIN pos_order AS po on po.id = pol.order_id
                WHERE 
                    pol.product_id IN (%s) AND po.partner_id = %s AND po.back_order_reference is null or po.back_order_reference = ''
                ORDER BY 
                    pol.product_id, po.date_order DESC
                """ % (','.join(map(str, product_ids)), partner_id)
            self.env.cr.execute(sql)
            res_all_product_history = self.env.cr.dictfetchall()
            res_all = {
                'res_product_history': res_all_product_history,
                'res_last_purchase_history': res_all_last_purchase_history,
                'date_order': res_single_date_purchase_history,
                'order_name': res_single_order_name_purchase_history
            }
            return res_all
        return False

    @api.model
    def order_summary_report(self, val):
        order_vals = {}
        category_list = {}
        payment_list = {}
        domain = []
        count = 0.00
        amount = 0.00
        if val.get('session_id'):
            domain = [('session_id.id', '=', val.get('session_id'))]
        else:
            local = pytz.timezone(self.env.user.tz)
            start_date = val.get('start_date') + ' 00:00:01'
            start_date_time = datetime.strptime(start_date, "%Y-%m-%d %H:%M:%S")
            start_local_dt = local.localize(start_date_time, is_dst=None)
            start_utc_dt = start_local_dt.astimezone(pytz.utc)
            string_utc_date_time = start_utc_dt.strftime('%Y-%m-%d %H:%M:%S')

            end_date = val.get('end_date') + ' 23:59:59'
            end_date_time = datetime.strptime(end_date, "%Y-%m-%d %H:%M:%S")
            end_local_dt = local.localize(end_date_time, is_dst=None)
            end_utc_dt = end_local_dt.astimezone(pytz.utc)
            string_end_utc_date_time = end_utc_dt.strftime('%Y-%m-%d %H:%M:%S')
            domain = [('date_order', '>=', string_utc_date_time), ('date_order', '<=', string_end_utc_date_time)]
        if val.get('state'):
            domain += [('state', '=', val.get('state'))]
        orders = self.search(domain)
        if val.get('order_summary') or val.get('flag'):
            if val.get('state'):
                order_vals[val.get('state')] = []
            else:
                for order_state in orders.mapped('state'):
                    order_vals[order_state] = []
            for each_order in orders:
                user_tz = self.env.user.tz
                order_date_tz = each_order.date_order.astimezone(pytz.timezone(user_tz))
                if each_order.state in order_vals:
                    order_vals[each_order.state].append({
                        'order_ref': each_order.name,
                        'order_date': order_date_tz,
                        'total': each_order.amount_total
                    })
                else:
                    order_vals.update({
                        each_order.state.append({
                            'order_ref': each_order.name,
                            'order_date': order_date_tz,
                            'total': each_order.amount_total
                        })
                    })
        if val.get('category_summary') or val.get('flag'):
            if val.get('state'):
                category_list[val.get('state')] = {}
            else:
                for each_order in orders.mapped('state'):
                    category_list[each_order] = {}
            for order_line in orders.mapped('lines'):
                if order_line.order_id.state == 'paid':
                    if order_line.product_id.pos_categ_id.name in category_list[order_line.order_id.state]:
                        count = category_list[order_line.order_id.state][order_line.product_id.pos_categ_id.name][0]
                        amount = category_list[order_line.order_id.state][order_line.product_id.pos_categ_id.name][1]
                        count += order_line.qty
                        amount += order_line.price_subtotal_incl
                    else:
                        count = order_line.qty
                        amount = order_line.price_subtotal_incl
                if order_line.order_id.state == 'done':
                    if order_line.product_id.pos_categ_id.name in category_list[order_line.order_id.state]:
                        count = category_list[order_line.order_id.state][order_line.product_id.pos_categ_id.name][0]
                        amount = category_list[order_line.order_id.state][order_line.product_id.pos_categ_id.name][1]
                        count += order_line.qty
                        amount += order_line.price_subtotal_incl
                    else:
                        count = order_line.qty
                        amount = order_line.price_subtotal_incl
                if order_line.order_id.state == 'invoiced':
                    if order_line.product_id.pos_categ_id.name in category_list[order_line.order_id.state]:
                        count = category_list[order_line.order_id.state][order_line.product_id.pos_categ_id.name][0]
                        amount = category_list[order_line.order_id.state][order_line.product_id.pos_categ_id.name][1]
                        count += order_line.qty
                        amount += order_line.price_subtotal_incl
                    else:
                        count = order_line.qty
                        amount = order_line.price_subtotal_incl
                category_list[order_line.order_id.state].update(
                    {order_line.product_id.pos_categ_id.name: [count, amount]})
                if False in category_list[order_line.order_id.state]:
                    category_list[order_line.order_id.state]['others'] = category_list[order_line.order_id.state].pop(
                        False)
        if val.get('payment_summary') or val.get('flag'):
            if val.get('state'):
                payment_list[val.get('state')] = {}
            else:
                for each_order in orders.mapped('state'):
                    payment_list[each_order] = {}
            for payment_line in orders.mapped('payment_ids'):
                if payment_line.pos_order_id.state == 'paid':
                    if payment_line.payment_method_id.name in payment_list[payment_line.pos_order_id.state]:
                        count = payment_list[payment_line.pos_order_id.state][payment_line.payment_method_id.name]
                        count += payment_line.amount
                    else:
                        count = payment_line.amount
                if payment_line.pos_order_id.state == 'done':
                    if payment_line.payment_method_id.name in payment_list[payment_line.pos_order_id.state]:
                        count = payment_list[payment_line.pos_order_id.state][payment_line.payment_method_id.name]
                        count += payment_line.amount
                    else:
                        count = payment_line.amount
                if payment_line.pos_order_id.state == 'invoiced':
                    if payment_line.payment_method_id.name in payment_list[payment_line.pos_order_id.state]:
                        count = payment_list[payment_line.pos_order_id.state][payment_line.payment_method_id.name]
                        count += payment_line.amount
                    else:
                        count = payment_line.amount
                payment_list[payment_line.pos_order_id.state].update(
                    {payment_line.payment_method_id.name: float(format(count, '.2f'))})
        return {
            'order_report': order_vals,
            'category_report': category_list,
            'payment_report': payment_list,
            'state': val.get('state') or False
        }

    @api.model
    def product_summary_report(self, val):
        product_summary_dict = {}
        category_summary_dict = {}
        payment_summary_dict = {}
        location_summary_dict = {}
        if val.get('session_id'):
            domain = [('session_id.id', '=', val.get('session_id'))]
        else:
            local = pytz.timezone(self.env.user.tz)
            start_date = val.get('start_date') + " 00:00:00"
            start_date_time = datetime.strptime(start_date, "%Y-%m-%d %H:%M:%S")
            start_local_dt = local.localize(start_date_time, is_dst=None)
            start_utc_dt = start_local_dt.astimezone(pytz.utc)
            string_utc_date_time = start_utc_dt.strftime('%Y-%m-%d %H:%M:%S')

            end_date = val.get('end_date') + " 23:59:59"
            end_date_time = datetime.strptime(end_date, "%Y-%m-%d %H:%M:%S")
            end_local_dt = local.localize(end_date_time, is_dst=None)
            end_utc_dt = end_local_dt.astimezone(pytz.utc)
            string_end_utc_date_time = end_utc_dt.strftime('%Y-%m-%d %H:%M:%S')

            domain = [('date_order', '>=', string_utc_date_time), ('date_order', '<=', string_end_utc_date_time)]
        order_detail = self.search(domain)
        if order_detail:
            product_qty = 0
            location_qty = 0
            category_qty = 0
            payment = 0
            if ('product_summary' in val.get('summary') or len(val.get('summary')) == 0):
                for each_order_line in order_detail.mapped('lines'):
                    if each_order_line.product_id.name in product_summary_dict:
                        product_qty = product_summary_dict[each_order_line.product_id.name]
                        product_qty += each_order_line.qty
                    else:
                        product_qty = each_order_line.qty
                    product_summary_dict[each_order_line.product_id.name] = product_qty;

            if ('category_summary' in val.get('summary') or len(val.get('summary')) == 0):
                for each_order_line in order_detail.mapped('lines'):
                    if each_order_line.product_id.pos_categ_id.name in category_summary_dict:
                        category_qty = category_summary_dict[each_order_line.product_id.pos_categ_id.name]
                        category_qty += each_order_line.qty
                    else:
                        category_qty = each_order_line.qty
                    category_summary_dict[each_order_line.product_id.pos_categ_id.name] = category_qty;
                if (False in category_summary_dict):
                    category_summary_dict['Others'] = category_summary_dict.pop(False);

            if ('payment_summary' in val.get('summary') or len(val.get('summary')) == 0):
                for payment_line in order_detail.mapped('payment_ids'):
                    if payment_line.payment_method_id.name in payment_summary_dict:
                        payment = payment_summary_dict[payment_line.payment_method_id.name]
                        payment += payment_line.amount
                    else:
                        payment = payment_line.amount
                    payment_summary_dict[payment_line.payment_method_id.name] = float(format(payment, '2f'))

            if ('location_summary' in val.get('summary') or len(val.get('summary')) == 0):
                stock_picking_data = False
                stock_picking_data = self.env['stock.picking'].sudo().search(
                    [('pos_session_id', 'in', order_detail.mapped('session_id').ids)])

                if stock_picking_data:
                    for each_stock in stock_picking_data:
                        location_summary_dict[each_stock.location_id.name] = {}
                    # for each_stock in stock_picking_data:
                    for each_stock_line in stock_picking_data.mapped('move_ids_without_package'):
                        if each_stock_line.product_id.name in location_summary_dict[
                            each_stock_line.picking_id.location_id.name]:
                            location_qty = location_summary_dict[each_stock_line.picking_id.location_id.name][
                                each_stock_line.product_id.name]
                            location_qty += each_stock_line.quantity_done
                        else:
                            location_qty = each_stock_line.quantity_done
                        location_summary_dict[each_stock_line.picking_id.location_id.name][
                            each_stock_line.product_id.name] = location_qty

        return {
            'product_summary': product_summary_dict,
            'category_summary': category_summary_dict,
            'payment_summary': payment_summary_dict,
            'location_summary': location_summary_dict,
        }

    @api.model
    def prepare_payment_summary_data(self, row_data, key):
        payment_details = {}
        summary_data = {}

        for each in row_data:
            if key == 'journals':
                payment_details.setdefault(each['month'], {})
                payment_details[each['month']].update({each['name']: each['amount']})
                summary_data.setdefault(each['name'], 0.0)
                summary_data.update({each['name']: summary_data[each['name']] + each['amount']})
            else:
                payment_details.setdefault(each['login'], {})
                payment_details[each['login']].setdefault(each['month'], {each['name']: 0})
                payment_details[each['login']][each['month']].update({each['name']: each['amount']})

        return [payment_details, summary_data]

    @api.model
    def payment_summary_report(self, vals):
        sql = False
        final_data_dict = dict.fromkeys(
            ['journal_details', 'salesmen_details', 'summary_data'], {})
        current_time_zone = self.env.user.tz or 'UTC'
        if vals.get('session_id'):
            if vals.get('summary') == 'journals':
                sql = """ SELECT
                                REPLACE(CONCAT(to_char(to_timestamp(
                                EXTRACT(month FROM pp.payment_date AT TIME ZONE 'UTC' AT TIME ZONE '%s')::text, 'MM'),'Month'),
                                '-',EXTRACT(year FROM pp.payment_date AT TIME ZONE 'UTC' AT TIME ZONE '%s')),
                                ' ', '') AS month,
                                ppm.name, ppm.id,
                                SUM(pp.amount) AS amount
                                FROM pos_payment AS pp
                                INNER JOIN pos_payment_method AS ppm ON ppm.id = pp.payment_method_id
                                WHERE session_id = %s
                                GROUP BY month, ppm.name, ppm.id
                                ORDER BY month ASC
                            """ % (current_time_zone, current_time_zone, vals.get('session_id'))
            if vals.get('summary') == 'sales_person':
                sql = """ SELECT
                                REPLACE(CONCAT(to_char(to_timestamp(
                                EXTRACT(month FROM pp.payment_date AT TIME ZONE 'UTC' AT TIME ZONE '%s')::text, 'MM'), 'Month'), 
                                '-',EXTRACT(year FROM pp.payment_date AT TIME ZONE 'UTC' AT TIME ZONE '%s')),
                                ' ', '') AS month,
                                rp.name AS login, ppm.name, SUM(pp.amount) AS amount
                                FROM
                                pos_order AS po
                                INNER JOIN res_users AS ru ON ru.id = po.user_id
                                INNER JOIN res_partner AS rp ON rp.id = ru.partner_id
                                INNER JOIN pos_payment AS pp ON pp.pos_order_id = po.id
                                INNER JOIN pos_payment_method AS ppm ON ppm.id = pp.payment_method_id
                                WHERE
                                po.session_id = %s
                                GROUP BY ppm.name, rp.name, month""" % (
                    current_time_zone, current_time_zone, vals.get('session_id'))
        else:
            local = pytz.timezone(self.env.user.tz)
            start_date = vals.get('start_date') + " 00:00:00"
            start_date_time = datetime.strptime(start_date, "%Y-%m-%d %H:%M:%S")
            start_local_dt = local.localize(start_date_time, is_dst=None)
            start_utc_dt = start_local_dt.astimezone(pytz.utc)
            string_utc_date_time = start_utc_dt.strftime('%Y-%m-%d %H:%M:%S')

            end_date = vals.get('end_date') + " 23:59:59"
            end_date_time = datetime.strptime(end_date, "%Y-%m-%d %H:%M:%S")
            end_local_dt = local.localize(end_date_time, is_dst=None)
            end_utc_dt = end_local_dt.astimezone(pytz.utc)
            string_end_utc_date_time = end_utc_dt.strftime('%Y-%m-%d %H:%M:%S')

            s_date, e_date = start_end_date_global(string_utc_date_time, string_end_utc_date_time, current_time_zone)
            if vals.get('summary') == 'journals':
                sql = """ SELECT
                                REPLACE(CONCAT(to_char(to_timestamp(
                                EXTRACT(month FROM pp.payment_date AT TIME ZONE 'UTC' AT TIME ZONE '%s')::text, 'MM'),'Month'),
                                '-',EXTRACT(year FROM pp.payment_date AT TIME ZONE 'UTC' AT TIME ZONE '%s')),
                                ' ', '') AS month,
                                ppm.name, ppm.id,
                                SUM(pp.amount) AS amount
                                FROM pos_payment AS pp
                                INNER JOIN pos_payment_method AS ppm ON ppm.id = pp.payment_method_id
                                WHERE payment_date BETWEEN  '%s' AND '%s'
                                GROUP BY month, ppm.name, ppm.id
                                ORDER BY month ASC
                            """ % (current_time_zone, current_time_zone, s_date, e_date)

            if vals.get('summary') == 'sales_person':
                sql = """ SELECT
                                REPLACE(CONCAT(to_char(to_timestamp(
                                EXTRACT(month FROM pp.payment_date AT TIME ZONE 'UTC' AT TIME ZONE '%s')::text, 'MM'), 'Month'), 
                                '-',EXTRACT(year FROM pp.payment_date AT TIME ZONE 'UTC' AT TIME ZONE '%s')),
                                ' ', '') AS month,
                                rp.name AS login, ppm.name, SUM(pp.amount) AS amount
                                FROM
                                pos_order AS po
                                INNER JOIN res_users AS ru ON ru.id = po.user_id
                                INNER JOIN res_partner AS rp ON rp.id = ru.partner_id
                                INNER JOIN pos_payment AS pp ON pp.pos_order_id = po.id
                                INNER JOIN pos_payment_method AS ppm ON ppm.id = pp.payment_method_id
                                WHERE
                                po.date_order BETWEEN '%s' AND '%s'
                                GROUP BY ppm.name, rp.name, month""" % (
                    current_time_zone, current_time_zone, s_date, e_date)
        if sql:
            self._cr.execute(sql)
            sql_result = self._cr.dictfetchall()

            if sql_result:
                result = self.prepare_payment_summary_data(sql_result, vals.get('summary'))
                if vals.get('summary') == 'journals':
                    final_data_dict.update({'journal_details': result[0], 'summary_data': result[1]})
                    return final_data_dict
                else:
                    final_data_dict.update({'salesmen_details': result[0]})
                    return final_data_dict
            else:
                return final_data_dict
        else:
            return final_data_dict


class ReturnPosOrderLineLot(models.Model):
    _name = "return.pos.pack.operation.lot"
    _description = "Return Specify product lot/serial number in pos order line"
    _rec_name = "lot_name"

    pos_order_line_id = fields.Many2one('pos.order.line')
    order_id = fields.Many2one('pos.order', related="pos_order_line_id.order_id", readonly=False)
    lot_name = fields.Char('Lot Name')
    product_id = fields.Many2one('product.product', related='pos_order_line_id.product_id', readonly=False)

    def _export_for_ui(self, lot):
        return {'lot_name': lot.lot_name}

    def export_for_ui(self):
        return self.mapped(self._export_for_ui) if self else []


class PosOrderLine(models.Model):
    _inherit = 'pos.order.line'

    uom_id = fields.Many2one('uom.uom', string="UOM")
    total_qty = fields.Float('Product Quantity', digits='Product Unit of Measure', default=1)
    order_return_qty = fields.Float('Remaining Qty', digits='Product Unit of Measure', default=1)
    return_pack_lot_ids = fields.One2many('return.pos.pack.operation.lot', 'pos_order_line_id',
                                          string='Remaining Lot/serial')
    line_note = fields.Char('Comment', size=512)
    # kitchen screen
    state = fields.Selection(
        selection=[("Waiting", "Waiting"), ("Preparing", "Preparing"), ("Delivering", "Delivering"),
                   ("Done", "Done")], default="Waiting")
    line_cid = fields.Char('Line cid')
    # combo
    is_combo_line = fields.Boolean(string="Is Combo Line", default=0)
    combo_lines = fields.One2many('pos.combo.line', 'order_line_id', string='Combo Lines',
                                  states={'draft': [('readonly', False)]},
                                  readonly=True, copy=True)
    quantityLine = fields.Text(string='Quantity Line of category')
    useQuantityLine = fields.Text(string='Use quantity Line Of Product')

    bom_id=fields.Many2one('mrp.bom')



    # @api.depends('product_id')
    # def assign_bom(self):
    #     for rec in self:
    #         #product_id=self.env['product.product'].search([('id','=',product_id)])
    #         bom_id=self.env['mrp.bom'].search([('product_tmpl_id','=',rec.product_id.product_tmpl_id.id)], limit=1)
    #         print("assign_bomassign_bomassign_bomassign_bom", bom_id)

    #         if bom_id:
    #             rec.bom_id=bom_id.id

    #         else:
    #             rec.bom_id=False
    #         return bom_id or False

    def _export_for_ui(self, orderline):
        return_pack_lot_ids = []
        vals = {
            'qty': orderline.qty,
            'order_return_qty': orderline.order_return_qty,
            'price_unit': orderline.price_unit,
            'price_subtotal': orderline.price_subtotal,
            'price_subtotal_incl': orderline.price_subtotal_incl,
            'product_id': orderline.product_id.id,
            'discount': orderline.discount,
            'line_note': orderline.line_note,
            'tax_ids': [[6, False, orderline.tax_ids.mapped(lambda tax: tax.id)]],
            'id': orderline.id,
            'state': orderline.state,
            'pack_lot_ids': [[0, 0, lot] for lot in orderline.pack_lot_ids.export_for_ui()],
            'return_pack_lot_ids': [[0, 0, lot] for lot in orderline.return_pack_lot_ids.export_for_ui()],
        }
        if vals.get('return_pack_lot_ids'):
            pos_line_ids = self.search_read([('id', '=', vals.get('id'))])
            operation_lot_id = self.env['pos.pack.operation.lot'].search(
                [('id', 'in', pos_line_ids[0].get('return_pack_lot_ids'))])
            for operation_lot_name in operation_lot_id.mapped('display_name'):
                return_pack_lot_ids.append({'lot_name': operation_lot_name})
            vals['operation_lot_name'] = return_pack_lot_ids
        return vals

    def pos_order_line_read(self, line_ids):
        pos_line_ids = self.search_read([('id', 'in', line_ids)])
        for pos_line_id in pos_line_ids:
            pack_lot_ids = []
            operation_lot_id = self.env['pos.pack.operation.lot'].search(
                [('id', 'in', pos_line_id.get('pack_lot_ids'))])
            for operation_lot_name in operation_lot_id.mapped('display_name'):
                pack_lot_ids.append({'lot_name': operation_lot_name})
            pos_line_id['operation_lot_name'] = pack_lot_ids
        return pos_line_ids

    @api.model
    def create(self, vals):
        try:
            if vals.get('uom_id'):
                vals['uom_id'] = vals.get('uom_id')[0]
        except Exception:
            vals['uom_id'] = vals.get('uom_id') or None
            pass
        return super(PosOrderLine, self).create(vals)
        # bom_id=self.env['mrp.bom'].search([('product_tmpl_id','=', self.product_id.product_tmpl_id.id)], limit=1)
        # print("assign_bomassign_bomassign_bomassign_bom", bom_id)

        # if bom_id:
        #     vals['bom_id']=bom_id.id

        # else:
        #     vals['bom_id']=False

        #return res

    @api.model
    def update_orderline_state(self, vals):
        order_line = self.browse(vals['order_line_id'])
        order = self.env['pos.order'].browse(vals['order_id'])
        if line_state[vals['state']] >= line_state[order_line.state]:
            order_line.sudo().write({
                'state': vals['state']
            })
            vals['pos_reference'] = order_line.order_id.pos_reference
            state_list = [line.state for line in order.lines]
            if 'Waiting' in state_list:
                order_state = 'Start'
                order.sudo().write({'order_state': order_state})
            elif 'Preparing' in state_list:
                order_state = 'Deliver'
                order.sudo().write({'order_state': order_state})
            else:
                order_state = 'Done'
                order.sudo().write({'order_state': order_state})
            order.broadcast_order_data(False)
            vals.update({'server_id': order_line.id})
            vals.update({'line_cid': order_line.line_cid})
            notify_data = {'order_line_state': vals}
            kitchen_user_ids = self.env['res.users'].search([('kitchen_screen_user', 'in', ['manager', 'waiter'])])
            order.broadcast_order_data(False)
            notifications = []
            if kitchen_user_ids:
                for kitchen_user_id in kitchen_user_ids:
                    notifications.append([kitchen_user_id.partner_id, 'pos.order/kitchen_screen', notify_data])
            if notifications:
                self.env['bus.bus']._sendmany(notifications)
        return True

    @api.model
    def update_all_orderline_state(self, vals):
        order = self.env['pos.order'].browse(vals['order_id'])
        order.sudo().write({'order_state': vals['order_state']})
        for line in order.lines:
            if line_state[vals['line_state']] >= line_state[line.state]:
                notifications = []
                line.sudo().write({'state': vals['line_state']})
                vals['pos_reference'] = line.order_id.pos_reference
                vals['server_id'] = line.id
                vals['state'] = vals['line_state']
                vals['line_cid'] = line.line_cid
                notify_data = {'order_line_state': vals}
                kitchen_user_ids = self.env['res.users'].search([('kitchen_screen_user', '=', 'manager')])
                notifications = []
                if kitchen_user_ids:
                    for kitchen_user_id in kitchen_user_ids:
                        notifications.append([kitchen_user_id.partner_id, 'pos.order/kitchen_screen', notify_data])
                if notifications:
                    self.env['bus.bus']._sendmany(notifications)
        order.broadcast_order_data(False)
        return True

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
