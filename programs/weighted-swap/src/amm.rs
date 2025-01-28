use crate::account_meta_for_swap::WeightedSwapSwap;
use crate::pda::get_withdraw_authority_address;
use crate::pool::Pool;
use crate::ID;
use anchor_lang::solana_program::pubkey::Pubkey;
use anchor_lang::AccountDeserialize;
use anyhow::Result;
use jupiter_amm_interface::{
    try_get_account_data, AccountMap, Amm, AmmContext, KeyedAccount, Quote, QuoteParams, Swap, SwapAndAccountMetas,
    SwapParams,
};
use math::fixed_math::SCALE;
use rust_decimal::Decimal;
use spl_associated_token_account::get_associated_token_address;
use stabble_vault::pda::get_vault_authority_address;
use stabble_vault::vault::Vault;

pub struct WeightedSwap {
    key: Pubkey,
    state: Pool,
    beneficiary: Option<Pubkey>,
    is_active: bool,
}

impl Clone for WeightedSwap {
    fn clone(&self) -> Self {
        WeightedSwap {
            key: self.key,
            state: self.state.clone(),
            beneficiary: self.beneficiary.clone(),
            is_active: self.is_active,
        }
    }
}

impl Amm for WeightedSwap {
    fn from_keyed_account(keyed_account: &KeyedAccount, _amm_context: &AmmContext) -> Result<Self> {
        let state = Pool::try_deserialize(&keyed_account.account.data[..]).unwrap();

        Ok(Self {
            key: keyed_account.key,
            state,
            beneficiary: None,
            is_active: true,
        })
    }

    fn label(&self) -> String {
        String::from("stabble Weighted Swap")
    }

    fn program_id(&self) -> Pubkey {
        ID
    }

    fn key(&self) -> Pubkey {
        self.key
    }

    fn get_reserve_mints(&self) -> Vec<Pubkey> {
        self.state.tokens.iter().map(|token| token.mint).collect()
    }

    fn get_accounts_to_update(&self) -> Vec<Pubkey> {
        vec![self.key, self.state.vault]
    }

    fn update(&mut self, account_map: &AccountMap) -> Result<()> {
        let mut vault_data = try_get_account_data(account_map, &self.state.vault)?;
        let vault = Vault::try_deserialize(&vault_data).unwrap();
        self.beneficiary = Some(vault.beneficiary);
        self.is_active = vault.is_active;

        let mut pool_data = try_get_account_data(account_map, &self.key)?;
        self.state = Pool::try_deserialize(&pool_data).unwrap();

        Ok(())
    }

    fn quote(&self, quote_params: &QuoteParams) -> Result<Quote> {
        let token_in_index = self.state.get_token_index(quote_params.input_mint).unwrap();
        let token_out_index = self.state.get_token_index(quote_params.output_mint).unwrap();

        let amount_in = self
            .state
            .calc_rounded_amount(quote_params.amount, token_in_index)
            .unwrap();
        let (amount_out, amount_fee) = self
            .state
            .get_swap_result(token_in_index, token_out_index, quote_params.amount, 0)
            .unwrap();

        Ok(Quote {
            fee_pct: Decimal::from_i128_with_scale(self.state.swap_fee as i128, SCALE),
            in_amount: amount_in,
            out_amount: amount_out,
            fee_amount: amount_fee,
            fee_mint: quote_params.output_mint,
            ..Quote::default()
        })
    }

    fn get_swap_and_account_metas(&self, swap_params: &SwapParams) -> Result<SwapAndAccountMetas> {
        let SwapParams {
            token_transfer_authority,
            source_token_account,
            destination_token_account,
            source_mint,
            destination_mint,
            ..
        } = swap_params;

        let vault_authority = get_vault_authority_address(&self.state.vault);
        let vault_source_token_account = get_associated_token_address(&vault_authority, &source_mint);
        let vault_destination_token_account = get_associated_token_address(&vault_authority, &destination_mint);
        let beneficiary_destination_token_account =
            get_associated_token_address(&self.beneficiary.as_ref().unwrap(), &destination_mint);

        Ok(SwapAndAccountMetas {
            swap: Swap::StabbleWeightedSwap,
            account_metas: WeightedSwapSwap {
                user: *token_transfer_authority,
                mint_in: *source_mint,
                mint_out: *destination_mint,
                user_token_in: *source_token_account,
                user_token_out: *destination_token_account,
                vault_token_in: vault_source_token_account,
                vault_token_out: vault_destination_token_account,
                beneficiary_token_out: beneficiary_destination_token_account,
                pool: self.key,
                withdraw_authority: get_withdraw_authority_address(&self.state.vault),
                vault: self.state.vault,
                vault_authority,
            }
            .into(),
        })
    }

    fn clone_amm(&self) -> Box<dyn Amm + Send + Sync> {
        Box::new(self.clone())
    }

    fn program_dependencies(&self) -> Vec<(Pubkey, String)> {
        vec![(stabble_vault::id(), String::from("stabble_vault"))]
    }

    fn is_active(&self) -> bool {
        self.state.is_active && self.is_active
    }
}
