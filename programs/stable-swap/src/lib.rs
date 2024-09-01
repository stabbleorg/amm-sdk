//! Anchor-compatible SDK for the stable_swap program.
#![allow(unused)]

#[cfg(feature = "jupiter-amm")]
pub mod account_meta_for_swap;
#[cfg(feature = "jupiter-amm")]
pub mod amm;
pub mod contexts;
pub mod pda;
pub mod pool;

use crate::contexts::*;
use anchor_lang::prelude::*;

declare_id!("swapNyd8XiQwJ6ianp9snpu4brUqFxadzvHebnAXjJZ");

#[program]
pub mod stable_swap {
    use super::*;

    /// initialize a pool
    pub fn initialize(ctx: Context<Initialize>, amp_factor: u16, swap_fee: u64, max_caps: Vec<u64>) -> Result<()> {
        Ok(())
    }

    /// shutdown the zero-liquidity pool
    pub fn shutdown(ctx: Context<Shutdown>) -> Result<()> {
        Ok(())
    }

    /// add liquidity
    pub fn deposit<'a, 'b, 'c, 'info>(
        ctx: Context<'_, '_, '_, 'info, Deposit<'info>>,
        amounts: Vec<u64>,
        minimum_amount_out: u64,
    ) -> Result<()> {
        Ok(())
    }

    /// remove liquidity
    pub fn withdraw<'a, 'b, 'c, 'info>(
        ctx: Context<'_, '_, '_, 'info, Withdraw<'info>>,
        amount: u64,
        minimum_amounts_out: Vec<u64>,
    ) -> Result<()> {
        Ok(())
    }

    /// swap
    pub fn swap(ctx: Context<Swap>, amount_in: Option<u64>, minimum_amount_out: u64) -> Result<()> {
        Ok(())
    }

    /* Configuration */

    pub fn change_amp_factor(ctx: Context<OwnerOnly>, new_amp_factor: u16, ramp_duration: u32) -> Result<()> {
        Ok(())
    }

    pub fn change_swap_fee(ctx: Context<OwnerOnly>, new_swap_fee: u64) -> Result<()> {
        Ok(())
    }

    pub fn pause(ctx: Context<OwnerOnly>) -> Result<()> {
        Ok(())
    }

    pub fn unpause(ctx: Context<OwnerOnly>) -> Result<()> {
        Ok(())
    }

    pub fn transfer_owner(ctx: Context<OwnerOnly>, new_owner: Pubkey) -> Result<()> {
        Ok(())
    }

    pub fn accept_owner(ctx: Context<PendingOwnerOnly>) -> Result<()> {
        Ok(())
    }

    pub fn reject_owner(ctx: Context<PendingOwnerOnly>) -> Result<()> {
        Ok(())
    }
}
