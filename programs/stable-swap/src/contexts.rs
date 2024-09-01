use anchor_lang::prelude::*;

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(signer)]
    pub owner: AccountInfo<'info>,
    pub mint: AccountInfo<'info>,
    #[account(mut)]
    pub pool: AccountInfo<'info>,
    pub pool_authority: AccountInfo<'info>,
    pub withdraw_authority: AccountInfo<'info>,
    pub vault: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Shutdown<'info> {
    #[account(mut)]
    pub owner: AccountInfo<'info>,

    #[account(mut)]
    pub pool: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(signer)]
    pub user: AccountInfo<'info>,
    #[account(mut)]
    pub user_pool_token: AccountInfo<'info>,
    #[account(mut)]
    pub mint: AccountInfo<'info>,
    #[account(mut)]
    pub pool: AccountInfo<'info>,
    pub pool_authority: AccountInfo<'info>,
    pub vault: AccountInfo<'info>,
    pub vault_authority: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(signer)]
    pub user: AccountInfo<'info>,
    #[account(mut)]
    pub user_pool_token: AccountInfo<'info>,
    #[account(mut)]
    pub mint: AccountInfo<'info>,
    #[account(mut)]
    pub pool: AccountInfo<'info>,
    pub withdraw_authority: AccountInfo<'info>,
    pub vault: AccountInfo<'info>,
    pub vault_authority: AccountInfo<'info>,
    pub vault_program: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(signer)]
    pub user: AccountInfo<'info>,
    #[account(mut)]
    pub user_token_in: AccountInfo<'info>,
    #[account(mut)]
    pub user_token_out: AccountInfo<'info>,
    #[account(mut)]
    pub vault_token_in: AccountInfo<'info>,
    #[account(mut)]
    pub vault_token_out: AccountInfo<'info>,
    #[account(mut)]
    pub beneficiary_token_out: AccountInfo<'info>,
    #[account(mut)]
    pub pool: AccountInfo<'info>,
    pub withdraw_authority: AccountInfo<'info>,
    pub vault: AccountInfo<'info>,
    pub vault_authority: AccountInfo<'info>,
    pub vault_program: AccountInfo<'info>,
    pub token_program: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct OwnerOnly<'info> {
    #[account(signer)]
    pub owner: AccountInfo<'info>,
    #[account(mut)]
    pub pool: AccountInfo<'info>,
}

#[derive(Accounts)]
pub struct PendingOwnerOnly<'info> {
    #[account(signer)]
    pub pending_owner: AccountInfo<'info>,
    #[account(mut)]
    pub pool: AccountInfo<'info>,
}
