use anchor_lang::prelude::borsh;
use anchor_lang::{
    account,
    solana_program::{clock::Clock, pubkey::Pubkey},
    AnchorDeserialize, AnchorSerialize,
};
use bn::safe_math::CheckedMulDiv;
use math::{
    fixed_math::{FixedComplement, FixedMul},
    stable_math, swap_fee_math,
};
use spl_token::solana_program::sysvar::Sysvar;

#[derive(AnchorSerialize, AnchorDeserialize, Eq, PartialEq, Clone, Copy)]
pub struct PoolToken {
    pub mint: Pubkey,        // immutable
    pub decimals: u8,        // immutable
    pub scaling_up: bool,    // immutable
    pub scaling_factor: u64, // immutable
    pub balance: u64,
}

#[account]
pub struct Pool {
    pub owner: Pubkey,
    pub vault: Pubkey,      // immutable
    pub mint: Pubkey,       // immutable
    pub authority_bump: u8, // immutable
    pub is_active: bool,
    pub amp_initial_factor: u16,
    pub amp_target_factor: u16,
    pub ramp_start_ts: i64,
    pub ramp_stop_ts: i64,
    pub swap_fee: u64,
    pub tokens: Vec<PoolToken>,
    pub pending_owner: Option<Pubkey>,
}

impl Pool {
    pub fn get_amplification(&self) -> u64 {
        let amp_initial_factor = self.amp_initial_factor as u64;
        let amp_target_factor = self.amp_target_factor as u64;
        let current_ts = Clock::get().unwrap().unix_timestamp;

        if current_ts <= self.ramp_start_ts {
            amp_initial_factor.saturating_mul(stable_math::AMP_PRECISION)
        } else if current_ts >= self.ramp_stop_ts {
            amp_target_factor.saturating_mul(stable_math::AMP_PRECISION)
        } else {
            let ramp_elapsed = current_ts.saturating_sub(self.ramp_start_ts) as u64 / 60 * 60;
            let ramp_duration = self.ramp_stop_ts.saturating_sub(self.ramp_start_ts) as u64;
            if amp_initial_factor <= amp_target_factor {
                let amp_offset = (amp_target_factor.saturating_sub(amp_initial_factor))
                    .saturating_mul(stable_math::AMP_PRECISION)
                    .checked_mul_div_down(ramp_elapsed, ramp_duration)
                    .unwrap();
                amp_initial_factor
                    .saturating_mul(stable_math::AMP_PRECISION)
                    .saturating_add(amp_offset)
            } else {
                let amp_offset = (amp_initial_factor.saturating_sub(amp_target_factor))
                    .saturating_mul(stable_math::AMP_PRECISION)
                    .checked_mul_div_down(ramp_elapsed, ramp_duration)
                    .unwrap();
                amp_initial_factor
                    .saturating_mul(stable_math::AMP_PRECISION)
                    .saturating_sub(amp_offset)
            }
        }
    }

    pub fn get_balances(&self) -> Vec<u64> {
        self.tokens.iter().map(|token| token.balance).collect()
    }

    pub fn get_token_index(&self, mint: Pubkey) -> usize {
        self.tokens
            .iter()
            .enumerate()
            .find(|(_, token)| token.mint == mint)
            .unwrap()
            .0
    }

    /// scaling up/down from token amount to wrapped balance amount
    pub fn calc_wrapped_amount(&self, amount: u64, token_index: usize) -> u64 {
        if self.tokens[token_index].scaling_factor == 1 {
            amount
        } else if self.tokens[token_index].scaling_up {
            amount * self.tokens[token_index].scaling_factor
        } else {
            amount / self.tokens[token_index].scaling_factor
        }
    }

    /// scaling up/down from wrapped balance amount to token amount
    pub fn calc_unwrapped_amount(&self, amount: u64, token_index: usize) -> u64 {
        if self.tokens[token_index].scaling_factor == 1 {
            amount
        } else if self.tokens[token_index].scaling_up {
            amount / self.tokens[token_index].scaling_factor
        } else {
            amount * self.tokens[token_index].scaling_factor
        }
    }

    /// round down token amount not to send the lost amount from wrapped balance amount when it scaled down
    pub fn calc_rounded_amount(&self, amount: u64, token_index: usize) -> u64 {
        if self.tokens[token_index].scaling_up {
            amount
        } else {
            amount / self.tokens[token_index].scaling_factor * self.tokens[token_index].scaling_factor
        }
    }

    /// estimated swap amount out
    pub fn get_swap_result(
        &self,
        token_in_index: usize,
        token_out_index: usize,
        amount_in: u64,
        x_amount: u64,
    ) -> Option<(u64, u64)> {
        let amplification = self.get_amplification();
        let balances = self.get_balances();
        let current_invariant = stable_math::calc_invariant(amplification, &balances)?;
        let swap_fee = swap_fee_math::calc_swap_fee_in_discount(self.swap_fee, x_amount)?;

        let wrapped_amount_in = self.calc_wrapped_amount(amount_in, token_in_index);
        let wrapped_amount_out_without_fee = stable_math::calc_out_given_in(
            amplification,
            &balances,
            token_in_index,
            token_out_index,
            wrapped_amount_in,
            current_invariant,
        )?;

        let wrapped_amount_out = wrapped_amount_out_without_fee.mul_down(swap_fee.complement())?;
        let wrapped_amount_fee = wrapped_amount_out_without_fee.checked_sub(wrapped_amount_out)?;
        let amount_out = self.calc_unwrapped_amount(wrapped_amount_out, token_out_index);
        let amount_fee = self.calc_unwrapped_amount(wrapped_amount_fee, token_out_index);

        Some((amount_out, amount_fee))
    }
}
