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

import pytz
import logging

from collections import defaultdict
from datetime import datetime, date, timedelta
from pytz import timezone
from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError
from odoo.tools import float_is_zero, float_compare, DEFAULT_SERVER_DATETIME_FORMAT

global closing
_logger = logging.getLogger(__name__)


class PosSession(models.Model):
    _inherit = 'pos.session'

    is_lock_screen = fields.Boolean(string="Lock Screen")

    def connection_check(self):
        return True

    def _get_split_receivable_vals(self, payment, amount, amount_converted):
        accounting_partner = self.env["res.partner"]._find_accounting_partner(payment.partner_id)
        partial_vals = {
            'account_id': accounting_partner.property_account_receivable_id.id,
            'move_id': self.move_id.id,
            'partner_id': accounting_partner.id,
            'name': '%s - %s' % (self.name, payment.payment_method_id.name),
        }
        if payment.payment_method_id.jr_use_for == 'wallet':
            partial_vals.update({
                'account_id': self.config_id.wallet_account_id.id,
                'is_wallet': True
            })
        if payment.payment_method_id.jr_use_for == 'gift_card':
            partial_vals.update({
                'account_id': self.config_id.gift_card_account_id.id,
            })
        return self._debit_amounts(partial_vals, amount, amount_converted)

    def _get_combine_receivable_vals(self, payment_method, amount, amount_converted):
        partial_vals = {
            'account_id': self._get_receivable_account(payment_method).id,
            'move_id': self.move_id.id,
            'name': '%s - %s' % (self.name, payment_method.name)
        }
        if payment_method.jr_use_for == 'gift_card':
            partial_vals.update({
                'account_id': self.config_id.gift_card_account_id.id,
            })
        return self._debit_amounts(partial_vals, amount, amount_converted)

    def _prepare_line(self, order_line):
        res = super(PosSession, self)._prepare_line(order_line)
        if self.config_id.enable_gift_card and (order_line.product_id.id == self.config_id.gift_card_product_id.id):
            res.update({
                'income_account_id': self.config_id.gift_card_account_id.id,
            })
        return res

    def _accumulate_amounts(self, data):
        # Accumulate the amounts for each accounting lines group
        # Each dict maps `key` -> `amounts`, where `key` is the group key.
        # E.g. `combine_receivables_bank` is derived from pos.payment records
        # in the self.order_ids with group key of the `payment_method_id`
        # field of the pos.payment record.
        amounts = lambda: {'amount': 0.0, 'amount_converted': 0.0}
        tax_amounts = lambda: {'amount': 0.0, 'amount_converted': 0.0, 'base_amount': 0.0, 'base_amount_converted': 0.0}
        split_receivables_bank = defaultdict(amounts)
        split_receivables_cash = defaultdict(amounts)
        split_receivables_pay_later = defaultdict(amounts)
        combine_receivables_bank = defaultdict(amounts)
        combine_receivables_cash = defaultdict(amounts)
        combine_receivables_pay_later = defaultdict(amounts)
        combine_invoice_receivables = defaultdict(amounts)
        split_invoice_receivables = defaultdict(amounts)
        sales = defaultdict(amounts)
        taxes = defaultdict(tax_amounts)
        stock_expense = defaultdict(amounts)
        stock_return = defaultdict(amounts)
        stock_output = defaultdict(amounts)
        wallet_vals = []
        rounding_difference = {'amount': 0.0, 'amount_converted': 0.0}
        wallet_difference = {'amount': 0.0, 'amount_converted': 0.0}
        # Track the receivable lines of the order's invoice payment moves for reconciliation
        # These receivable lines are reconciled to the corresponding invoice receivable lines
        # of this session's move_id.
        combine_inv_payment_receivable_lines = defaultdict(lambda: self.env['account.move.line'])
        split_inv_payment_receivable_lines = defaultdict(lambda: self.env['account.move.line'])
        rounded_globally = self.company_id.tax_calculation_rounding_method == 'round_globally'
        pos_receivable_account = self.company_id.account_default_pos_receivable_account_id
        currency_rounding = self.currency_id.rounding
        for order in self.order_ids:
            order_is_invoiced = order.is_invoiced
            for payment in order.payment_ids:
                amount = payment.amount
                if float_is_zero(amount, precision_rounding=currency_rounding):
                    continue
                date = payment.payment_date
                payment_method = payment.payment_method_id
                is_split_payment = payment.payment_method_id.split_transactions
                payment_type = payment_method.type

                # If not pay_later, we create the receivable vals for both invoiced and uninvoiced orders.
                #   Separate the split and aggregated payments.
                # Moreover, if the order is invoiced, we create the pos receivable vals that will balance the
                # pos receivable lines from the invoice payments.
                if payment_type != 'pay_later':
                    if is_split_payment and payment_type == 'cash':
                        split_receivables_cash[payment] = self._update_amounts(split_receivables_cash[payment],
                                                                               {'amount': amount}, date)
                    elif not is_split_payment and payment_type == 'cash':
                        combine_receivables_cash[payment_method] = self._update_amounts(
                            combine_receivables_cash[payment_method], {'amount': amount}, date)
                    elif is_split_payment and payment_type == 'bank':
                        split_receivables_bank[payment] = self._update_amounts(split_receivables_bank[payment],
                                                                               {'amount': amount}, date)
                    elif not is_split_payment and payment_type == 'bank':
                        combine_receivables_bank[payment_method] = self._update_amounts(
                            combine_receivables_bank[payment_method], {'amount': amount}, date)

                    # Create the vals to create the pos receivables that will balance the pos receivables from invoice payment moves.
                    if order_is_invoiced:
                        if is_split_payment:
                            split_inv_payment_receivable_lines[payment] |= payment.account_move_id.line_ids.filtered(
                                lambda line: line.account_id == pos_receivable_account)
                            split_invoice_receivables[payment] = self._update_amounts(
                                split_invoice_receivables[payment], {'amount': payment.amount}, order.date_order)
                        else:
                            combine_inv_payment_receivable_lines[
                                payment_method] |= payment.account_move_id.line_ids.filtered(
                                lambda line: line.account_id == pos_receivable_account)
                            combine_invoice_receivables[payment_method] = self._update_amounts(
                                combine_invoice_receivables[payment_method], {'amount': payment.amount},
                                order.date_order)

                # If pay_later, we create the receivable lines.
                #   if split, with partner
                #   Otherwise, it's aggregated (combined)
                # But only do if order is *not* invoiced because no account move is created for pay later invoice payments.
                if payment_type == 'pay_later' and not order_is_invoiced:
                    if is_split_payment:
                        split_receivables_pay_later[payment] = self._update_amounts(
                            split_receivables_pay_later[payment], {'amount': amount}, date)
                    elif not is_split_payment:
                        combine_receivables_pay_later[payment_method] = self._update_amounts(
                            combine_receivables_pay_later[payment_method], {'amount': amount}, date)

            if not order_is_invoiced:
                order_taxes = defaultdict(tax_amounts)
                for order_line in order.lines:
                    if self.config_id.enable_wallet and (order_line.product_id.id == self.config_id.wallet_product.id):
                        amount = order_line.price_subtotal_incl
                        amount_converted = self.company_id.currency_id.round(order_line.price_subtotal_incl)
                        wallet_vals.append(self._get_wallet_credit_vals(amount, amount_converted, order_line.order_id))
                    else:
                        line = self._prepare_line(order_line)
                        # Combine sales/refund lines
                        sale_key = (
                            # account
                            line['income_account_id'],
                            # sign
                            -1 if line['amount'] < 0 else 1,
                            # for taxes
                            tuple((tax['id'], tax['account_id'], tax['tax_repartition_line_id']) for tax in
                                  line['taxes']),
                            line['base_tags'],
                        )
                        sales[sale_key] = self._update_amounts(sales[sale_key], {'amount': line['amount']},
                                                               line['date_order'])
                        # Combine tax lines
                        for tax in line['taxes']:
                            tax_key = (
                                tax['account_id'], tax['tax_repartition_line_id'], tax['id'], tuple(tax['tag_ids']))
                            order_taxes[tax_key] = self._update_amounts(
                                order_taxes[tax_key],
                                {'amount': tax['amount'], 'base_amount': tax['base']},
                                tax['date_order'],
                                round=not rounded_globally
                            )
                for tax_key, amounts in order_taxes.items():
                    if rounded_globally:
                        amounts = self._round_amounts(amounts)
                    for amount_key, amount in amounts.items():
                        taxes[tax_key][amount_key] += amount

                if self.company_id.anglo_saxon_accounting and order.picking_ids.ids:
                    # Combine stock lines
                    stock_moves = self.env['stock.move'].sudo().search([
                        ('picking_id', 'in', order.picking_ids.ids),
                        ('company_id.anglo_saxon_accounting', '=', True),
                        ('product_id.categ_id.property_valuation', '=', 'real_time')
                    ])
                    for move in stock_moves:
                        exp_key = move.product_id._get_product_accounts()['expense']
                        out_key = move.product_id.categ_id.property_stock_account_output_categ_id
                        amount = -sum(move.sudo().stock_valuation_layer_ids.mapped('value'))
                        stock_expense[exp_key] = self._update_amounts(stock_expense[exp_key], {'amount': amount},
                                                                      move.picking_id.date, force_company_currency=True)
                        if move.location_id.usage == 'customer':
                            stock_return[out_key] = self._update_amounts(stock_return[out_key], {'amount': amount},
                                                                         move.picking_id.date,
                                                                         force_company_currency=True)
                        else:
                            stock_output[out_key] = self._update_amounts(stock_output[out_key], {'amount': amount},
                                                                         move.picking_id.date,
                                                                         force_company_currency=True)

                if order.change_amount_for_wallet > self.company_id.currency_id.round(0.0):
                    # wallet_amount['amount'] = order.change_amount_for_wallet
                    wallet_difference = self._update_amounts(wallet_difference,
                                                             {'amount': order.change_amount_for_wallet},
                                                             order.date_order)
                    wallet_difference['order_id'] = order

                if self.config_id.cash_rounding:
                    # diff = order.amount_paid - order.amount_total
                    diff = order.amount_paid - order.amount_total - order.change_amount_for_wallet
                    rounding_difference = self._update_amounts(rounding_difference, {'amount': diff}, order.date_order)

                # Increasing current partner's customer_rank
                partners = (order.partner_id | order.partner_id.commercial_partner_id)
                partners._increase_rank('customer_rank')

        if self.company_id.anglo_saxon_accounting:
            global_session_pickings = self.picking_ids.filtered(lambda p: not p.pos_order_id)
            if global_session_pickings:
                stock_moves = self.env['stock.move'].sudo().search([
                    ('picking_id', 'in', global_session_pickings.ids),
                    ('company_id.anglo_saxon_accounting', '=', True),
                    ('product_id.categ_id.property_valuation', '=', 'real_time'),
                ])
                for move in stock_moves:
                    exp_key = move.product_id._get_product_accounts()['expense']
                    out_key = move.product_id.categ_id.property_stock_account_output_categ_id
                    amount = -sum(move.stock_valuation_layer_ids.mapped('value'))
                    stock_expense[exp_key] = self._update_amounts(stock_expense[exp_key], {'amount': amount},
                                                                  move.picking_id.date)
                    if move.location_id.usage == 'customer':
                        stock_return[out_key] = self._update_amounts(stock_return[out_key], {'amount': amount},
                                                                     move.picking_id.date)
                    else:
                        stock_output[out_key] = self._update_amounts(stock_output[out_key], {'amount': amount},
                                                                     move.picking_id.date)
        MoveLine = self.env['account.move.line'].with_context(check_move_validity=False)
        MoveLine.create(wallet_vals)

        data.update({
            'taxes': taxes,
            'sales': sales,
            'stock_expense': stock_expense,
            'split_receivables_bank': split_receivables_bank,
            'combine_receivables_bank': combine_receivables_bank,
            'split_receivables_cash': split_receivables_cash,
            'combine_receivables_cash': combine_receivables_cash,
            'combine_invoice_receivables': combine_invoice_receivables,
            'split_receivables_pay_later': split_receivables_pay_later,
            'combine_receivables_pay_later': combine_receivables_pay_later,
            'stock_return': stock_return,
            'stock_output': stock_output,
            'combine_inv_payment_receivable_lines': combine_inv_payment_receivable_lines,
            'rounding_difference': rounding_difference,
            'wallet_difference': wallet_difference,
            'MoveLine': MoveLine,
            'split_invoice_receivables': split_invoice_receivables,
            'split_inv_payment_receivable_lines': split_inv_payment_receivable_lines,
        })
        return data

    def _get_wallet_credit_vals(self, amount, amount_converted, order):
        partial_args = {
            'name': 'Wallet Credit',
            'is_wallet': True,
            'move_id': self.move_id.id,
            'partner_id': order.partner_id._find_accounting_partner(order.partner_id).id,
            'account_id': self.config_id.wallet_account_id.id,
        }
        return self._credit_amounts(partial_args, amount, amount_converted)

    def _create_non_reconciliable_move_lines(self, data):
        # Create account.move.line records for
        #   - sales
        #   - taxes
        #   - stock expense
        #   - non-cash split receivables (not for automatic reconciliation)
        #   - non-cash combine receivables (not for automatic reconciliation)
        taxes = data.get('taxes')
        sales = data.get('sales')
        stock_expense = data.get('stock_expense')
        rounding_difference = data.get('rounding_difference')
        wallet_difference = data.get('wallet_difference')
        MoveLine = data.get('MoveLine')

        tax_vals = [
            self._get_tax_vals(key, amounts['amount'], amounts['amount_converted'], amounts['base_amount_converted'])
            for key, amounts in taxes.items() if amounts['amount']]
        # Check if all taxes lines have account_id assigned. If not, there are repartition lines of the tax that have no account_id.
        tax_names_no_account = [line['name'] for line in tax_vals if line['account_id'] == False]
        if len(tax_names_no_account) > 0:
            error_message = _(
                'Unable to close and validate the session.\n'
                'Please set corresponding tax account in each repartition line of the following taxes: \n%s'
            ) % ', '.join(tax_names_no_account)
            raise UserError(error_message)
        rounding_vals = []
        wallet_vals = []

        if not float_is_zero(rounding_difference['amount'],
                             precision_rounding=self.currency_id.rounding) or not float_is_zero(
            rounding_difference['amount_converted'], precision_rounding=self.currency_id.rounding):
            rounding_vals = [self._get_rounding_difference_vals(rounding_difference['amount'],
                                                                rounding_difference['amount_converted'])]

        if not float_is_zero(wallet_difference['amount'],
                             precision_rounding=self.currency_id.rounding) or not float_is_zero(
            wallet_difference['amount_converted'], precision_rounding=self.currency_id.rounding):
            wallet_vals = [self._get_wallet_difference_vals(wallet_difference['order_id'], wallet_difference['amount'],
                                                            wallet_difference['amount_converted'])]

        MoveLine.create(
            tax_vals
            + [self._get_sale_vals(key, amounts['amount'], amounts['amount_converted']) for key, amounts in
               sales.items()]
            + [self._get_stock_expense_vals(key, amounts['amount'], amounts['amount_converted']) for key, amounts in
               stock_expense.items()]
            + rounding_vals
            + wallet_vals
        )
        return data

    def _get_wallet_difference_vals(self, order, amount, amount_converted):
        if self.config_id.enable_wallet:
            partial_args = {
                'name': 'Wallet Credit',
                'is_wallet': True,
                'move_id': self.move_id.id,
                'partner_id': order.partner_id._find_accounting_partner(order.partner_id).id,
                'account_id': self.config_id.wallet_account_id.id,
            }
            return self._credit_amounts(partial_args, amount, amount_converted)

    # POS Close Session
    @api.model
    def send_email_z_report(self, id):
        email_id = ''
        try:
            session_obj = self.env['pos.session'].browse(id)
            template_id = session_obj.config_id.email_template_id
            for user in session_obj.config_id.users_ids:
                if user.partner_id.email:
                    email_id += user.partner_id.email
            template_id.email_to = email_id
            template_id.send_mail(session_obj.id, force_send=True)
        except Exception as e:
            _logger.error('Unable to send email for z report of session %s', e)
        return True

    def cash_control_line(self, vals):
        cash_line = []
        if vals:
            cashbox_end_id = self.env['account.bank.statement.cashbox'].create([{}])
            for data in vals:
                cash_line.append((0, 0, {
                    'coin_value': data.get('coin_value'),
                    'number': data.get('number_of_coins'),
                    'subtotal': data.get('subtotal'),
                    'cashbox_id': cashbox_end_id.id,
                }))
            cashbox_end_id.write({'cashbox_lines_ids': cash_line})
        for statement in self.statement_ids:
            statement.write({'cashbox_end_id': cashbox_end_id.id, 'balance_end_real': cashbox_end_id.total})
            self.set_cashbox_closing(cashbox_end_id.total)
        return True

    def set_cashbox_closing(self, total):
        closing = total

    def get_cashbox_closing(self):
        return closing

    def set_cashbox_opening(self, opening_balance):
        self.state = 'opened'
        self.cash_register_id.balance_start = opening_balance

    def auto_close_pos_session(self):
        enable_auto_close_session = self.env['ir.config_parameter'].sudo().get_param(
            'flexibite_ee_advance.enable_auto_close_session')
        if enable_auto_close_session:
            session_ids = self.search([('state', 'in', ['opened', 'closing_control'])])
            for cash_control_session in session_ids.filtered(lambda session_id: session_id.config_id.cash_control):
                # cash_control_session.action_pos_session_closing_control()
                cashbox_end_id = self.env['account.bank.statement.cashbox'].create([{}])
                cash_line = [(0, 0, {
                    'coin_value': 1,
                    'number': cash_control_session.cash_register_balance_end,
                    'subtotal': cash_control_session.cash_register_balance_end,
                    'cashbox_id': cashbox_end_id.id,
                })]
                cashbox_end_id.write({'cashbox_lines_ids': cash_line, })
                for statement in cash_control_session.statement_ids:
                    statement.write({'cashbox_end_id': cashbox_end_id.id,
                                     'balance_end_real': cash_control_session.cash_register_balance_end})
                cash_control_session._compute_cash_balance()
                cash_control_session.write({'stop_at': fields.Datetime.now()})
                cash_control_session.action_pos_session_validate()
            for cash_control_session in session_ids.filtered(lambda session_id: not session_id.config_id.cash_control):
                cash_control_session.action_pos_session_closing_control()

    # Reports Methods
    def get_net_gross_total(self, user_lst=None):
        net_profit_total = 0.0
        start_date, end_date = self.date_time_to_utc(
            fields.Date.to_string(self.start_date) + ' 00:00:00',
            fields.Date.to_string(self.end_date) + ' 23:59:59')
        company_id = self.env.user.company_id.id
        domain = [
            ('state', '!=', 'draft'),
            ('company_id', '=', company_id),
            ('date_order', '>=', start_date),
            ('date_order', '<=', end_date)
        ]
        pos_order_obj = self.env['pos.order'].search(domain)
        for order in pos_order_obj:
            for line in order.lines:
                discount = (((line.price_unit * line.qty) * line.discount) / 100)
                net_profit_total += ((line.price_subtotal_incl - (
                        (line.qty * line.product_id.standard_price) + discount)) / line.price_subtotal_incl) * 100
        return net_profit_total

    def get_product_name(self, category_id):
        if category_id:
            category_name = self.env['pos.category'].browse([category_id]).name
            return category_name

    def get_session_date_time(self, flag):
        date_time_dict = {'start_date': '', 'end_date': '', 'time': ''}
        local = pytz.timezone(self._context.get('tz', 'utc') or 'utc')

        start_date = pytz.utc.localize(
            datetime.strptime(str(self.start_at), DEFAULT_SERVER_DATETIME_FORMAT))
        if self.stop_at:
            stop_date = pytz.utc.localize(
                datetime.strptime(str(self.stop_at), DEFAULT_SERVER_DATETIME_FORMAT))
            converted_stop_date = datetime.strftime(stop_date.astimezone(local),
                                                    DEFAULT_SERVER_DATETIME_FORMAT)
            date_time_dict.update({'end_date': converted_stop_date})
        final_converted_date = datetime.strftime(start_date.astimezone(local),
                                                 DEFAULT_SERVER_DATETIME_FORMAT)
        final_converted_time = datetime.strptime(final_converted_date,
                                                 DEFAULT_SERVER_DATETIME_FORMAT)
        date_time_dict.update({'time': final_converted_time.strftime('%I:%M:%S %p'),
                               'start_date': final_converted_time.date() if flag
                               else final_converted_time})
        return date_time_dict

    def get_current_date_time(self):
        user_tz = self.env.user.tz or pytz.utc
        return {'date': datetime.now(timezone(user_tz)).date(),
                'time': datetime.now(timezone(user_tz)).strftime('%I:%M:%S %p')}

    def get_pos_name(self):
        if self and self.config_id:
            return self.config_id.name

    def get_inventory_details(self):
        product_product = self.env['product.product']
        stock_location = self.config_id.picking_type_id.default_location_src_id
        inventory_records = []
        final_list = []
        product_details = []
        if self and self.id:
            for order in self.order_ids:
                for line in order.lines:
                    product_details.append({
                        'id': line.product_id.id,
                        'qty': line.qty,
                    })
        custom_list = []
        for each_prod in product_details:
            if each_prod.get('id') not in [x.get('id') for x in custom_list]:
                custom_list.append(each_prod)
            else:
                for each in custom_list:
                    if each.get('id') == each_prod.get('id'):
                        each.update({'qty': each.get('qty') + each_prod.get('qty')})
        for each in custom_list:
            product_id = product_product.browse(each.get('id'))
            if product_id:
                inventory_records.append({
                    'product_id': [product_id.id, product_id.name],
                    'category_id': [product_id.id, product_id.categ_id.name],
                    'used_qty': each.get('qty'),
                    'quantity': product_id.with_context(
                        {'location': stock_location.id, 'compute_child': False}).qty_available,
                    'uom_name': product_id.uom_id.name or ''
                })
            if inventory_records:
                temp_list = []
                temp_obj = []
                for each in inventory_records:
                    if each.get('product_id')[0] not in temp_list:
                        temp_list.append(each.get('product_id')[0])
                        temp_obj.append(each)
                    else:
                        for rec in temp_obj:
                            if rec.get('product_id')[0] == each.get('product_id')[0]:
                                qty = rec.get('quantity') + each.get('quantity')
                                rec.update({'quantity': qty})
                final_list = sorted(temp_obj, key=lambda k: k['quantity'])
        return final_list or []

    def get_total_closing(self):
        return self.cash_register_balance_end_real

    def get_total_tax(self):
        if self:
            self.env.cr.execute("""SELECT COALESCE(SUM(amount_tax), 0.0) AS total 
                                    FROM pos_order WHERE state != 'draft' 
                                    AND session_id = %s""" % self.id)
            return self.env.cr.dictfetchall()[0]['total']
        return 0.0

    def get_vat_tax(self):
        taxes_info = []
        if self:
            tax_list = [tax.id for order in self.order_ids for line in
                        order.lines.filtered(lambda line: line.tax_ids_after_fiscal_position) for
                        tax in
                        line.tax_ids_after_fiscal_position]
            tax_list = list(set(tax_list))
            for tax in self.env['account.tax'].browse(tax_list):
                total_tax = 0.00
                net_total = 0.00
                for line in self.env['pos.order.line'].search(
                        [('order_id', 'in', [order.id for order in self.order_ids])]).filtered(
                    lambda line: tax in line.tax_ids_after_fiscal_position):
                    total_tax += line.price_subtotal * tax.amount / 100
                    net_total += line.price_subtotal
                taxes_info.append({
                    'tax_name': tax.name,
                    'tax_total': total_tax,
                    'tax_per': tax.amount,
                    'net_total': net_total,
                    'gross_tax': total_tax + net_total
                })
        return taxes_info

    def get_total_sales(self):
        self.env.cr.execute("""SELECT
                                COALESCE(SUM(pol.price_unit * pol.qty), 0.0) AS total 
                                FROM pos_order AS po
                                LEFT JOIN pos_order_line AS pol ON pol.order_id = po.id 
                                WHERE po.amount_total > 0 
                                AND po.session_id = %s
                                AND po.state NOT IN ('draft', 'cancel')
                                """ % self.id)
        return self.env.cr.dictfetchall()[0]['total']

    def get_total_return_sales(self):
        self.env.cr.execute("""SELECT
                                COALESCE(SUM(amount_total), 0.0) AS total 
                                FROM pos_order
                                WHERE amount_total < 0
                                AND session_id = %s
                                AND state != 'draft'
                                """ % self.id)
        return abs(self.env.cr.dictfetchall()[0]['total'])

    def get_gross_total(self):
        gross_total = 0.0
        company_id = self.env.user.company_id.id
        domain = [
            ('state', '!=', 'draft'),
            ('company_id', '=', company_id),
            ('session_id', '=', self.id),
        ]
        pos_order_obj = self.env['pos.order'].search(domain)
        for order in pos_order_obj:
            for line in order.lines:
                gross_total += line.price_subtotal - (line.qty * line.product_id.standard_price)
        return gross_total

    def get_gross_profit(self):
        gross_profit_total = 0.0
        company_id = self.env.user.company_id.id
        domain = [
            ('state', '!=', 'draft'),
            ('company_id', '=', company_id),
            ('session_id', '=', self.id),
        ]
        # if user_id:
        #     domain.append(('user_id', '=', user_id))
        pos_order_obj = self.env['pos.order'].search(domain)
        for order in pos_order_obj:
            for line in order.lines:
                if line.price_subtotal != 0:
                    gross_profit_total += ((line.price_subtotal - (
                            line.qty * line.product_id.standard_price)) / line.price_subtotal) * 100
        return gross_profit_total

    def get_net_profit(self):
        net_profit_total = 0.0
        company_id = self.env.user.company_id.id
        domain = [
            ('state', '!=', 'draft'),
            ('company_id', '=', company_id),
            ('session_id', '=', self.id),
        ]
        pos_order_obj = self.env['pos.order'].search(domain)
        for order in pos_order_obj:
            for line in order.lines:
                if line.price_subtotal != 0:
                    discount = (((line.price_unit * line.qty) * line.discount) / 100)
                    net_profit_total += ((line.price_subtotal_incl - (
                            (line.qty * line.product_id.standard_price) + discount)) / line.price_subtotal_incl) * 100
        return net_profit_total

    # PAYMENT DATA FROM X AND Z REPORT
    def get_payments(self):
        if self:
            sql = """SELECT ppm.id, ppm.name AS pay_method, SUM(pp.amount) AS amount 
                        FROM pos_payment AS pp
                        LEFT JOIN pos_payment_method AS ppm on ppm.id = pp.payment_method_id 
                        WHERE session_id = %s
                        GROUP BY ppm.name, ppm.id""" % self.id
            self.env.cr.execute(sql)
            result = self.env.cr.dictfetchall()
            return result and result or []

    # DISCOUNT DATA FROM X AND Z REPORT
    def get_total_discount(self):
        sql = """SELECT 
                    COALESCE(SUM((((pol.price_unit * pol.qty) * pol.discount) / 100)), 0.0) AS total
                    FROM pos_order AS po
                    INNER JOIN pos_order_line AS pol ON pol.order_id = po.id
                    WHERE session_id = %s 
                    AND po.state != 'draft'
                    AND pol.discount > 0 
                    AND pol.price_subtotal > 0""" % self.id
        self.env.cr.execute(sql)
        return abs(self.env.cr.dictfetchall()[0]['total'])

    # PRODUCT CATEGORY DATA FROM X AND Z REPORT
    def get_product_category(self):
        sql = """SELECT pc.name AS category, SUM(pol.price_subtotal_incl) AS total 
                    FROM pos_order as po
                    LEFT JOIN pos_order_line AS pol on pol.order_id = po.id
                    INNER JOIN product_product AS pp on pp.id = pol.product_id
                    INNER JOIN product_template AS pt on pt.id = pp.product_tmpl_id
                    LEFT JOIN pos_category AS pc on pc.id = pt.pos_categ_id
                    WHERE po.session_id = %s
                    AND po.state != 'draft'
                    GROUP BY pc.name, pc.id 
                """ % self.id
        self.env.cr.execute(sql)
        category_data = self.env.cr.dictfetchall()
        return category_data if category_data else []

# vim:expandtab:smartindent:tabstop=4:softtabstop=4:shiftwidth=4:
