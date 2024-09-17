use crate::fixed_math::{self, FixedComplement, FixedDiv, FixedMul};
use bn::{
    safe_math::{CheckedDivCeil, CheckedMulDiv, Downcast},
    uint192, U192,
};

pub const AMP_PRECISION: u64 = 1_000;

pub const MIN_AMP: u16 = 1;
pub const MAX_AMP: u16 = 8000;

pub const MIN_SWAP_FEE: u64 = 1_000; // 0.0001%
pub const MAX_SWAP_FEE: u64 = 10_000_000; // 1%

// Safe max balance supported by stable_math
pub const MAX_SAFE_BALANCE: u64 = 3_000_000_000_000_000_000; // 3B

pub const INV_THRESHOLD: u64 = 100;
pub const BALANCE_THRESHOLD: u64 = 1;

pub const MIN_TOKENS: usize = 2;
pub const MAX_TOKENS: usize = 5;

pub fn amp_precision_u192() -> U192 {
    uint192!(AMP_PRECISION)
}

// StableMath._calculateInvariant
// Computes the invariant given the current balances, using the Newton-Raphson approximation.
// The amplification parameter equals: A n^(n-1)
// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-stable/contracts/StableMath.sol#L57-L120
pub fn calc_invariant(amplification: u64, balances: &Vec<u64>) -> Option<u64> {
    // invariant                                                                                 //
    // D = invariant                                                  D^(n+1)                    //
    // A = amplification coefficient      A  n^n S + D = A D n^n + -----------                   //
    // S = sum of balances                                             n^n P                     //
    // P = product of balances                                                                   //
    // n = number of tokens                                                                      //

    // Always round down, to match Vyper's arithmetic (which always truncates).
    let sum: u64 = balances.iter().sum(); // S in the Curve version

    if sum == 0 {
        return Some(0);
    }

    let num_tokens = balances.len() as u64;
    let amp_times_total = amplification.checked_mul(num_tokens)?; // Ann in the Curve version

    let sum = uint192!(sum);
    let mut invariant = sum; // D in the Curve version

    for _ in 0..255 {
        let mut p = invariant;

        for i in 0..balances.len() {
            // (p * invariant) / (balances[i] * num_tokens)
            p = p.checked_mul_div_down(invariant, uint192!(balances[i].checked_mul(num_tokens)?))?;
        }

        let prev_invariant = invariant; // Dprev in the Curve version

        invariant = (uint192!(amp_times_total)
            .checked_mul_div_down(sum, amp_precision_u192())?
            .checked_add(p.checked_mul(uint192!(balances.len()))?))?
        .checked_mul_div_down(
            invariant,
            uint192!(amp_times_total.checked_sub(AMP_PRECISION)?)
                .checked_mul_div_down(invariant, amp_precision_u192())?
                .checked_add(uint192!(num_tokens.saturating_add(1)).checked_mul(p)?)?,
        )?;

        let invariant = invariant.as_u64()?;
        let prev_invariant = prev_invariant.as_u64()?;

        if invariant > prev_invariant {
            if invariant.saturating_sub(prev_invariant) <= INV_THRESHOLD {
                return Some(invariant);
            }
        } else if prev_invariant.saturating_sub(invariant) <= INV_THRESHOLD {
            return Some(invariant);
        }
    }

    None
}

// Computes how many tokens can be taken out of a pool if `token_amount_in` are sent, given the current balances.
// The amplification parameter equals: A n^(n-1)
// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-stable/contracts/StableMath.sol#L124-L159
pub fn calc_out_given_in(
    amplification: u64,
    balances: &Vec<u64>,
    token_index_in: usize,
    token_index_out: usize,
    token_amount_in: u64,
    invariant: u64,
) -> Option<u64> {
    /**************************************************************************************************************
    // outGivenIn token x for y - polynomial equation to solve                                                   //
    // ay = amount out to calculate                                                                              //
    // by = balance token out                                                                                    //
    // y = by - ay (finalBalanceOut)                                                                             //
    // D = invariant                                               D                     D^(n+1)                 //
    // A = amplification coefficient               y^2 + ( S + ----------  - D) * y -  ------------- = 0         //
    // n = number of tokens                                    (A * n^n)               A * n^2n * P              //
    // S = sum of final balances but y                                                                           //
    // P = product of final balances but y                                                                       //
     **************************************************************************************************************/
    // Amount out, so we round down overall.

    let mut new_balances = Vec::with_capacity(balances.len());
    for i in 0..balances.len() {
        if i == token_index_in {
            new_balances.push(balances[i].checked_add(token_amount_in)?);
        } else {
            new_balances.push(balances[i]);
        }
    }

    let balance_out = *balances.get(token_index_out)?;

    let final_balance_out =
        get_token_balance_given_invariant_n_all_other_balances(amplification, &new_balances, invariant, balance_out)?;

    balance_out.checked_sub(final_balance_out)?.checked_sub(1)
}

// Computes how many tokens must be sent to a pool if `token_amount_out` are sent given the
// current balances, using the Newton-Raphson approximation.
// The amplification parameter equals: A n^(n-1)
// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-stable/contracts/StableMath.sol#L164-L199
pub fn calc_in_given_out(
    amplification: u64,
    balances: &Vec<u64>,
    token_index_in: usize,
    token_index_out: usize,
    token_amount_out: u64,
    invariant: u64,
) -> Option<u64> {
    /**************************************************************************************************************
    // inGivenOut token x for y - polynomial equation to solve                                                   //
    // ax = amount in to calculate                                                                               //
    // bx = balance token in                                                                                     //
    // x = bx + ax (finalBalanceIn)                                                                              //
    // D = invariant                                                D                     D^(n+1)                //
    // A = amplification coefficient               x^2 + ( S + ----------  - D) * x -  ------------- = 0         //
    // n = number of tokens                                     (A * n^n)               A * n^2n * P             //
    // S = sum of final balances but x                                                                           //
    // P = product of final balances but x                                                                       //
     **************************************************************************************************************/
    // Amount in, so we round up overall.
    let mut new_balances = Vec::with_capacity(balances.len());
    for i in 0..balances.len() {
        if i == token_index_out {
            new_balances.push(balances[i].checked_sub(token_amount_out)?);
        } else {
            new_balances.push(balances[i]);
        }
    }

    let balance_in = *balances.get(token_index_in)?;

    let final_balance_in =
        get_token_balance_given_invariant_n_all_other_balances(amplification, &new_balances, invariant, balance_in)?;

    final_balance_in.checked_sub(balance_in)?.checked_add(1)
}

// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-stable/contracts/StableMath.sol#L201-L255
pub fn calc_pool_token_out_given_exact_tokens_in(
    amplification: u64,
    balances: &Vec<u64>,
    amounts_in: &Vec<u64>,
    pool_token_supply: u64,
    current_invariant: u64,
    swap_fee: u64,
) -> Option<u64> {
    // LP out, so we round down overall.

    // First loop calculates the sum of all token balances, which will be used to calculate
    // the current weights of each token, relative to this sum
    let sum: u64 = balances.iter().sum();

    // Calculate the weighted balance ratio without considering fees
    let mut balance_ratios_with_fee = Vec::with_capacity(balances.len());
    // The weighted sum of token balance ratios with fee
    let mut invariant_ratio_with_fees = 0;
    for i in 0..balances.len() {
        let current_weight = balances[i].div_down(sum)?;
        balance_ratios_with_fee.push(balances[i].checked_add(amounts_in[i])?.div_down(balances[i])?);
        invariant_ratio_with_fees = balance_ratios_with_fee[i]
            .mul_down(current_weight)?
            .checked_add(invariant_ratio_with_fees)?;
    }

    // Second loop calculates new amounts in, taking into account the fee on the percentage excess
    let mut new_balances = Vec::with_capacity(balances.len());
    for i in 0..balances.len() {
        let amount_in_without_fee;

        // Check if the balance ratio is greater than the ideal ratio to charge fees or not
        if balance_ratios_with_fee[i] > invariant_ratio_with_fees {
            let non_taxable_amount = balances[i].mul_down(invariant_ratio_with_fees.checked_sub(fixed_math::ONE)?)?;
            let taxable_amount = amounts_in[i].checked_sub(non_taxable_amount)?;

            amount_in_without_fee = taxable_amount
                .mul_down(swap_fee.complement())?
                .checked_add(non_taxable_amount)?;
        } else {
            amount_in_without_fee = amounts_in[i];
        }

        new_balances.push(balances[i].checked_add(amount_in_without_fee)?);
    }

    let new_invariant = calc_invariant(amplification, &new_balances)?;
    let invariant_ratio = new_invariant.div_down(current_invariant)?;

    // If the invariant didn't increase for any reason, we simply don't mint LP
    if invariant_ratio > fixed_math::ONE {
        pool_token_supply.mul_down(invariant_ratio.saturating_sub(fixed_math::ONE))
    } else {
        Some(0)
    }
}

// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-stable/contracts/StableMath.sol#L354-L395
pub fn calc_token_out_given_exact_pool_token_in(
    amplification: u64,
    balances: &Vec<u64>,
    token_index: usize,
    amount_in: u64,
    pool_token_supply: u64,
    current_invariant: u64,
    swap_fee: u64,
) -> Option<u64> {
    // Token out, so we round down overall.

    let new_invariant = pool_token_supply
        .checked_sub(amount_in)?
        .checked_mul_div_up(current_invariant, pool_token_supply)?;

    let balance = *balances.get(token_index)?;

    // Calculate amount out without fee
    let new_balance =
        get_token_balance_given_invariant_n_all_other_balances(amplification, &balances, new_invariant, balance)?;
    let amount_out_without_fee = balance.checked_sub(new_balance)?;

    // First calculate the sum of all token balances, which will be used to calculate
    // the current weight of each token
    let sum: u64 = balances.iter().sum();

    // We can now compute how much excess balance is being withdrawn as a result of the virtual swaps, which result
    // in swap fees.
    let current_weight = balance.div_down(sum)?;
    let taxable_percentage = current_weight.complement();

    // Swap fees are typically charged on 'token in', but there is no 'token in' here, so we apply it
    // to 'token out'. This results in slightly larger price impact. Fees are rounded up.
    let taxable_amount = amount_out_without_fee.mul_up(taxable_percentage)?;
    let non_taxable_amount = amount_out_without_fee.saturating_sub(taxable_amount);

    taxable_amount
        .mul_down(swap_fee.complement())?
        .checked_add(non_taxable_amount)
}

// This function calculates the balance of a given token (token_index)
// given all the other balances and the invariant
// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-stable/contracts/StableMath.sol#L399-L449
fn get_token_balance_given_invariant_n_all_other_balances(
    amplification: u64,
    balances: &Vec<u64>,
    invariant: u64,
    balance: u64, // balance of a given token (token_index)
) -> Option<u64> {
    // Rounds result up overall

    let num_tokens = balances.len() as u64;
    let amp_times_total = uint192!(amplification.checked_mul(num_tokens)?);

    let invariant = uint192!(invariant);

    let mut sum = balances[0];
    let mut p = uint192!(balances[0].checked_mul(num_tokens)?);
    for i in 1..balances.len() {
        let p_i = uint192!(balances[i].checked_mul(num_tokens)?);
        p = p.checked_mul_div_down(p_i, invariant)?;
        sum = sum.checked_add(balances[i])?;
    }

    // No need to use safe math, based on the loop above `sum` is greater than or equal to `balances[token_index]`
    sum = sum.saturating_sub(balance);
    let sum = uint192!(sum);

    let invariant_2 = invariant.checked_mul(invariant)?;
    // We remove the balance from c by multiplying it
    let c = invariant_2
        .checked_mul_div_up(amp_precision_u192(), amp_times_total.checked_mul(p)?)?
        .checked_mul(uint192!(balance))?;
    let b = invariant
        .checked_mul_div_down(amp_precision_u192(), amp_times_total)?
        .checked_add(sum)?;

    // We iterate to find the balance
    // We multiply the first iteration outside the loop with the invariant to set the value of the
    // initial approximation.
    let mut token_balance = invariant_2.checked_add(c)?.checked_div_up(invariant.checked_add(b)?)?;

    for _ in 0..255 {
        let prev_token_balance = token_balance;

        token_balance = token_balance
            .checked_mul(token_balance)?
            .checked_add(c)?
            .checked_div_up(
                // No need to use checked arithmetic because max value of `token_balance` is u128::MAX
                (token_balance << 1).checked_add(b)?.checked_sub(invariant)?, // token_balance * 2 + b - invariant
            )?;

        let token_balance = token_balance.as_u64()?;
        let prev_token_balance = prev_token_balance.as_u64()?;

        if token_balance > prev_token_balance {
            if token_balance.saturating_sub(prev_token_balance) <= BALANCE_THRESHOLD {
                return Some(token_balance);
            }
        } else if prev_token_balance.saturating_sub(token_balance) <= BALANCE_THRESHOLD {
            return Some(token_balance);
        }
    }

    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calc_out_given_in() {
        let balances = vec![
            776199829833940141,
            2206504616663253113,
            1763368950384576155,
            38416709841306561,
            18833762826780,
        ];
        let amplification = 500_000;
        calc_invariant(amplification, &balances).unwrap();

        let balances = vec![1332693902458055177, 534042038714371533, 93673549035235];
        let amplification = 10_000;
        calc_invariant(amplification, &balances).unwrap();

        let balances = vec![2397586296768312160, 2300831385038136337, 1410688950371];
        let amplification = 1_000;
        calc_invariant(amplification, &balances).unwrap();

        let amplification = 5_000_000;
        let balances = vec![40_000_000_000_000_000, 60_000_000_000_000_000];
        let invariant = calc_invariant(amplification, &balances).unwrap();
        assert_eq!(invariant, 99999583421855646);

        let token_amount_in = 100_000_000_000_000;
        let token_a_out = calc_out_given_in(amplification, &balances, 1, 0, token_amount_in, invariant).unwrap();
        let token_b_out = calc_out_given_in(amplification, &balances, 0, 1, token_amount_in, invariant).unwrap();
        assert_eq!(token_a_out, 99991271119067);
        assert_eq!(token_b_out, 100008628389994);

        let amplification = 750_000;
        let balances = vec![40_000_000_000_000_000, 50_000_000_000_000_000, 60_000_000_000_000_000];
        let invariant = calc_invariant(amplification, &balances).unwrap();
        assert_eq!(invariant, 149997226126050479);

        let amplification = 150_000;
        let balances = vec![
            40_000_000_000_000_000,
            50_000_000_000_000_000,
            60_000_000_000_000_000,
            70_000_000_000_000_000,
        ];
        let invariant = calc_invariant(amplification, &balances).unwrap();
        assert_eq!(invariant, 219967475585041316);

        let amplification = 5_000_000;
        let balances = vec![894_520_800_000_000, 467_581_800_000_000];
        let invariant = calc_invariant(amplification, &balances).unwrap();

        let token_amount_in = 1_000_000_000_000;
        let token_amount_out = calc_out_given_in(amplification, &balances, 0, 1, token_amount_in, invariant).unwrap();
        assert_eq!(token_amount_out, 999845351779);

        let token_amount_in = 1_000_000_000;
        let token_amount_out = calc_out_given_in(amplification, &balances, 0, 1, token_amount_in, invariant).unwrap();
        assert_eq!(token_amount_out, 999845869);

        let token_amount_in = 1_000_000;
        let token_amount_out = calc_out_given_in(amplification, &balances, 0, 1, token_amount_in, invariant).unwrap();
        assert_eq!(token_amount_out, 999845);
    }

    #[test]
    fn test_calc_pool_token_out_given_exact_tokens_in() {
        let amplification = 5_000_000;
        let balances = vec![894_520_800_000_000, 467_581_800_000_000];
        let invariant = calc_invariant(amplification, &balances).unwrap();

        let amounts_in = vec![1_000_000_000_000_000, 1_000_000_000_000_000];
        let amount_out = calc_pool_token_out_given_exact_tokens_in(
            amplification,
            &balances,
            &amounts_in,
            invariant,
            invariant,
            100_000,
        )
        .unwrap();
        assert_eq!(amount_out, 1999977982041509);

        let amounts_in = vec![0, 2_000_000_000_000];
        let amount_out = calc_pool_token_out_given_exact_tokens_in(
            amplification,
            &balances,
            &amounts_in,
            invariant,
            invariant,
            100_000,
        )
        .unwrap();
        assert_eq!(amount_out, 2000047447155);

        let amounts_in = vec![1_000_000_000_000, 1_000_000_000_000];
        let amount_out = calc_pool_token_out_given_exact_tokens_in(
            amplification,
            &balances,
            &amounts_in,
            invariant,
            invariant,
            100_000,
        )
        .unwrap();
        assert!(amount_out < 2000047447155);
        assert_eq!(amount_out, 1999994325732);

        let amounts_in = vec![2_000_000_000_000, 0];
        let amount_out = calc_pool_token_out_given_exact_tokens_in(
            amplification,
            &balances,
            &amounts_in,
            invariant,
            invariant,
            100_000,
        )
        .unwrap();
        assert!(amount_out < 1999994325732);
        assert_eq!(amount_out, 1999802271357);
        let amount_out = calc_pool_token_out_given_exact_tokens_in(
            amplification,
            &balances,
            &amounts_in,
            invariant,
            invariant,
            150_000,
        )
        .unwrap();
        assert!(amount_out < 1999802271357);
        let amount_out = calc_pool_token_out_given_exact_tokens_in(
            amplification,
            &balances,
            &amounts_in,
            invariant,
            invariant,
            50_000,
        )
        .unwrap();
        assert!(amount_out > 1999802271357);

        // balanced deposit
        let amounts_in = vec![1_313_441_146_063, 686_558_853_937];
        let amount_out = calc_pool_token_out_given_exact_tokens_in(
            amplification,
            &balances,
            &amounts_in,
            invariant,
            invariant,
            100_000,
        )
        .unwrap();
        assert_eq!(amount_out, 1999977980679);
        let amount_out = calc_pool_token_out_given_exact_tokens_in(
            amplification,
            &balances,
            &amounts_in,
            invariant,
            invariant,
            150_000,
        )
        .unwrap();
        assert_eq!(amount_out, 1999977980679);
        let amount_out = calc_pool_token_out_given_exact_tokens_in(
            amplification,
            &balances,
            &amounts_in,
            invariant,
            invariant,
            50_000,
        )
        .unwrap();
        assert_eq!(amount_out, 1999977980679);
        let amount_out = calc_pool_token_out_given_exact_tokens_in(
            amplification,
            &balances,
            &amounts_in,
            invariant,
            invariant,
            300_000,
        )
        .unwrap();
        assert_eq!(amount_out, 1999977980679);
    }
}
