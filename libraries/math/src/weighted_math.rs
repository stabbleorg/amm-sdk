use crate::fixed_math;
use crate::fixed_math::FixedComplement;
use crate::fixed_math::FixedDiv;
use crate::fixed_math::FixedMul;
use crate::fixed_math::FixedPow;

// A minimum normalized weight imposes a maximum weight ratio. We need this due to limitations in the
// implementation of the power function, as these ratios are often exponents.
pub const MIN_WEIGHT: u64 = 50_000_000; // 5%
pub const MAX_WEIGHT: u64 = 950_000_000; // 95%

pub const MIN_SWAP_FEE: u64 = 100_000; // 0.01%
pub const MAX_SWAP_FEE: u64 = 25_000_000; // 2.5%

// Safe max balance supported by weighted_math
pub const MAX_SAFE_BALANCE: u64 = 4_000_000_000_000_000_000; // 4B

pub const MIN_TOKENS: usize = 2;
pub const MAX_TOKENS: usize = 4;

// Pool limits that arise from limitations in the fixed point power function (and the imposed 1:100 maximum weight ratio).

// Swap limits: amounts swapped may not be larger than this percentage of total balance.
pub const MAX_IN_RATIO: u64 = 300_000_000;
pub const MAX_OUT_RATIO: u64 = 300_000_000;

// Invariant growth limit: non-proportional joins cannot cause the invariant to increase by more than this ratio.
pub const MAX_INVARIANT_RATIO: u64 = 3_000_000_000;
// Invariant shrink limit: non-proportional exits cannot cause the invariant to decrease by less than this ratio.
pub const MIN_INVARIANT_RATIO: u64 = 700_000_000;

// Invariant is used to collect protocol swap fees by comparing its value between two times.
// So we can round always to the same direction. It is also used to initiate the LP amount
// and, because there is a minimum LP, we round down the invariant.
// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-weighted/contracts/WeightedMath.sol#L56-L74
pub fn calc_invariant(balances: &Vec<u64>, normalized_weights: &Vec<u64>) -> Option<u64> {
    /**********************************************************************************************
    // invariant               _____                                                             //
    // wi = weight index i      | |      wi                                                      //
    // bi = balance index i     | |  bi ^   = i                                                  //
    // i = invariant                                                                             //
     **********************************************************************************************/

    let mut invariant = fixed_math::ONE;

    for i in 0..balances.len() {
        invariant = invariant.mul_down(balances[i].pow_down(normalized_weights[i])?)?;
    }

    if invariant > 0 {
        Some(invariant)
    } else {
        None
    }
}

// Computes how many tokens can be taken out of a pool if `amountIn` are sent, given the
// current balances and weights.
// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-weighted/contracts/WeightedMath.sol#L78-L109
pub fn calc_out_given_in(
    balance_in: u64,
    weight_in: u64,
    balance_out: u64,
    weight_out: u64,
    amount_in: u64,
) -> Option<u64> {
    /**********************************************************************************************
    // outGivenIn                                                                                //
    // aO = amountOut                                                                            //
    // bO = balanceOut                                                                           //
    // bI = balanceIn              /      /            bI             \    (wI / wO) \           //
    // aI = amountIn    aO = bO * |  1 - | --------------------------  | ^            |          //
    // wI = weightIn               \      \       ( bI + aI )         /              /           //
    // wO = weightOut                                                                            //
     **********************************************************************************************/
    // Amount out, so we round down overall.

    // The multiplication rounds down, and the subtrahend (power) rounds up (so the base rounds up too).
    // Because bI / (bI + aI) <= 1, the exponent rounds down.

    // Cannot exceed maximum in ratio
    if amount_in > balance_in.mul_down(MAX_IN_RATIO)? {
        return None;
    }

    let base = balance_in.div_up(balance_in.checked_add(amount_in)?)?;
    let exponent = weight_in.div_down(weight_out)?;
    let power = base.pow_up(exponent)?;

    balance_out.mul_down(power.complement())
}

// Computes how many tokens can be taken out of a pool if `amountIn` are sent, given the
// current balances and weights.
// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-weighted/contracts/WeightedMath.sol#L113-L147
pub fn calc_in_given_out(
    balance_in: u64,
    weight_in: u64,
    balance_out: u64,
    weight_out: u64,
    amount_out: u64,
) -> Option<u64> {
    /**********************************************************************************************
    // inGivenOut                                                                                //
    // aO = amountOut                                                                            //
    // bO = balanceOut                                                                           //
    // bI = balanceIn              /  /            bO             \    (wO / wI)      \          //
    // aI = amountIn    aI = bI * |  | --------------------------  | ^            - 1  |         //
    // wI = weightIn               \  \       ( bO - aO )         /                   /          //
    // wO = weightOut                                                                            //
     **********************************************************************************************/
    // Amount in, so we round up overall.

    // The multiplication rounds up, and the power rounds up (so the base rounds up too).
    // Because b0 / (b0 - a0) >= 1, the exponent rounds up.

    // Cannot exceed maximum out ratio
    if amount_out > balance_out.mul_down(MAX_OUT_RATIO)? {
        return None;
    }

    let base = balance_out.div_up(balance_out.checked_sub(amount_out)?)?;
    let exponent = weight_out.div_up(weight_in)?;
    let power = base.pow_up(exponent)?;

    balance_in.mul_up(power.checked_sub(fixed_math::ONE)?)
}

// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-weighted/contracts/WeightedMath.sol#L181-L228
pub fn calc_pool_token_out_given_exact_token_in(
    balance: u64,
    normalized_weight: u64,
    amount_in: u64,
    pool_token_supply: u64,
    swap_fee: u64,
) -> Option<u64> {
    // LP out, so we round down overall.

    let balance_ratio_with_fee = balance.checked_add(amount_in)?.div_down(balance)?;
    let invariant_ratio_with_fees = balance_ratio_with_fee
        .mul_down(normalized_weight)?
        .checked_add(normalized_weight.complement())?;

    let amount_in_without_fee = if balance_ratio_with_fee > invariant_ratio_with_fees {
        let non_taxable_amount = if invariant_ratio_with_fees > fixed_math::ONE {
            balance.mul_down(invariant_ratio_with_fees.checked_sub(fixed_math::ONE)?)?
        } else {
            0
        };
        let taxable_amount = amount_in.checked_sub(non_taxable_amount)?;
        let swap_fee_amount = taxable_amount.mul_up(swap_fee)?;
        non_taxable_amount
            .checked_add(taxable_amount)?
            .checked_sub(swap_fee_amount)?
    } else {
        amount_in
    };

    if amount_in_without_fee == 0 {
        return Some(0);
    }

    let balance_ratio = balance.checked_add(amount_in_without_fee)?.div_down(balance)?;
    let invariant_ratio = balance_ratio.pow_down(normalized_weight)?;

    if invariant_ratio > fixed_math::ONE {
        pool_token_supply.mul_down(invariant_ratio.saturating_sub(fixed_math::ONE))
    } else {
        Some(0)
    }
}

// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-weighted/contracts/WeightedMath.sol#L149-L179
pub fn calc_pool_token_out_given_exact_tokens_in(
    balances: &Vec<u64>,
    normalized_weights: &Vec<u64>,
    amounts_in: &Vec<u64>,
    pool_token_supply: u64,
    swap_fee: u64,
) -> Option<u64> {
    let mut balance_ratios_with_fee = vec![];
    let mut invariant_ratio_with_fees = 0;

    for i in 0..balances.len() {
        let balance_ratio_with_fee = balances[i].checked_add(amounts_in[i])?.div_down(balances[i])?;
        balance_ratios_with_fee.push(balance_ratio_with_fee);
        invariant_ratio_with_fees = balance_ratio_with_fee
            .mul_down(normalized_weights[i])?
            .checked_add(invariant_ratio_with_fees)?;
    }

    // See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-weighted/contracts/WeightedMath.sol#L233-L272
    let mut invariant_ratio = fixed_math::ONE;
    for i in 0..balances.len() {
        let amount_in_without_fee;

        if balance_ratios_with_fee[i] > invariant_ratio_with_fees {
            // invariantRatioWithFees might be less than FixedPoint.ONE in edge scenarios due to rounding error,
            // particularly if the weights don't exactly add up to 100%.
            let non_taxable_amount = if invariant_ratio_with_fees > fixed_math::ONE {
                balances[i].mul_down(invariant_ratio_with_fees.checked_sub(fixed_math::ONE)?)?
            } else {
                0
            };
            let swap_fee_amount = amounts_in[i].checked_sub(non_taxable_amount)?.mul_up(swap_fee)?;
            amount_in_without_fee = amounts_in[i].checked_sub(swap_fee_amount)?;
        } else {
            amount_in_without_fee = amounts_in[i];

            // If a token's amount in is not being charged a swap fee then it might be zero (e.g. when joining a
            // Pool with only a subset of tokens). In this case, `balance_ratio` will equal `FixedPoint.ONE`, and
            // the `invariantRatio` will not change at all. We therefore skip to the next iteration, avoiding
            // the costly `powDown` call.
            if amount_in_without_fee == 0 {
                continue;
            }
        }

        let balance_ratio = balances[i].checked_add(amount_in_without_fee)?.div_down(balances[i])?;
        invariant_ratio = invariant_ratio.mul_down(balance_ratio.pow_down(normalized_weights[i])?)?;
    }

    if invariant_ratio > fixed_math::ONE {
        pool_token_supply.mul_down(invariant_ratio.saturating_sub(fixed_math::ONE))
    } else {
        Some(0)
    }
}

// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-weighted/contracts/WeightedMath.sol#L423-L462
pub fn calc_token_out_given_exact_pool_token_in(
    balance: u64,
    normalized_weight: u64,
    amount_in: u64,
    pool_token_supply: u64,
    swap_fee: u64,
) -> Option<u64> {
    /*****************************************************************************************
    // exactLPInForTokenOut                                                                 //
    // a = amountOut                                                                        //
    // b = balance                   /      /      totalLP - lpIn      \    (1 / w)  \      //
    // lpIn = lpAmountIn    a = b * |  1 - | -------------------------- | ^           |     //
    // lp = totalLP                  \      \          totalLP         /             /      //
    // w = weight                                                                           //
     *****************************************************************************************/
    // Token out, so we round down overall. The multiplication rounds down, but the power rounds up (so the base
    // rounds up). Because (totalLP - lpIn) / totalLP <= 1, the exponent rounds down.

    // Calculate the factor by which the invariant will decrease after burning LPAmountIn

    let invariant_ratio = pool_token_supply.checked_sub(amount_in)?.div_up(pool_token_supply)?;
    if invariant_ratio < MIN_INVARIANT_RATIO {
        return None;
    }

    // Calculate by how much the token balance has to decrease to match invariantRatio
    let balance_ratio = invariant_ratio.pow_up(fixed_math::ONE.div_down(normalized_weight)?)?;

    // Because of rounding up, balance_ratio can be greater than one. Using complement prevents reverts.
    let amount_out_without_fee = balance.mul_down(balance_ratio.complement())?;

    // We can now compute how much excess balance is being withdrawn as a result of the virtual swaps, which result
    // in swap fees.

    // Swap fees are typically charged on 'token in', but there is no 'token in' here, so we apply it
    // to 'token out'. This results in slightly larger price impact. Fees are rounded up.
    let taxable_amount = amount_out_without_fee.mul_up(normalized_weight.complement())?;
    let non_taxable_amount = amount_out_without_fee.checked_sub(taxable_amount)?;
    let taxable_amount_minus_fees = taxable_amount.mul_down(swap_fee.complement())?;

    non_taxable_amount.checked_add(taxable_amount_minus_fees)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_calc_invariant() {
        let invariant = calc_invariant(
            &vec![4_000_000_000_000_000_000, 1_000_000_000_000_000_000],
            &vec![500_000_000, 500_000_000],
        )
        .unwrap();
        assert_eq!(invariant, 1999999999999899652);

        let invariant = calc_invariant(
            &vec![
                4_000_000_000_000_000_000,
                4_000_000_000_000_000_000,
                4_000_000_000_000_000_000,
                4_000_000_000_000_000_000,
            ],
            &vec![100_000_000, 200_000_000, 300_000_000, 400_000_000],
        )
        .unwrap();
        assert_eq!(invariant, 3999999829243548079);

        let invariant = calc_invariant(
            &vec![
                4_000_000_000_000_000_000,
                4_000_000_000_000_000_000,
                4_000_000_000_000_000_000,
            ],
            &vec![330_000_000, 330_000_000, 340_000_000],
        )
        .unwrap();
        assert_eq!(invariant, 3999999845679133687);

        let invariant = calc_invariant(
            &vec![
                4_000_000_000_000_000_000,
                4_000_000_000_000_000_000,
                4_000_000_000_000_000_000,
            ],
            &vec![200_000_000, 200_000_000, 600_000_000],
        )
        .unwrap();
        assert_eq!(invariant, 3999999833239242752);

        let invariant = calc_invariant(
            &vec![4_000_000_000_000_000_000, 4_000_000_000_000_000_000],
            &vec![100_000_000, 900_000_000],
        )
        .unwrap();
        assert_eq!(invariant, 3999999913148972546);

        let invariant = calc_invariant(
            &vec![4_000_000_000_000_000_000, 4_000_000_000_000_000_000],
            &vec![200_000_000, 800_000_000],
        )
        .unwrap();
        assert_eq!(invariant, 3999999916139535002);

        let invariant = calc_invariant(
            &vec![4_000_000_000_000_000_000, 4_000_000_000_000_000_000],
            &vec![50_000_000, 950_000_000],
        )
        .unwrap();
        assert_eq!(invariant, 3999999908179373469);
    }

    #[test]
    fn test_calc_out_given_in() {
        let amount_out = calc_out_given_in(
            5_000_000_000_000_000_000,
            500_000_000,
            1_000_000_000_000_000_000,
            500_000_000,
            100_000_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 19000000000);

        let amount_out = calc_out_given_in(
            5_000_000_000_000_000_000,
            500_000_000,
            1_000_000_000_000_000_000,
            500_000_000,
            1_000_000_000_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 199960000000000);

        let amount_out = calc_out_given_in(
            538787471_887000000,
            700_000_000,
            898152_463000000,
            300_000_000,
            100_000_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 396983388);

        let amount_out = calc_out_given_in(
            366851436508161000,
            600_000_000,
            958530278657000,
            400_000_000,
            100_000_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 390121823);

        let amount_out = calc_out_given_in(
            366851436508161000,
            50_000_000,
            958530278657000,
            950_000_000,
            100_000_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 25880317);
    }

    #[test]
    fn test_calc_pool_token_out() {
        let amount_out = calc_pool_token_out_given_exact_token_in(
            5_000_000_000_000_000_000,
            500_000_000,
            5_000_000_000_000_000,
            2236021719197214567 << 1,
            10_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 2224287077214867);

        let amount_out = calc_pool_token_out_given_exact_token_in(
            5_000_000_000_000_000_000,
            500_000_000,
            5_000_000_000_000,
            2236021719197214567 << 1,
            10_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 2222605588882);

        let amount_out = calc_pool_token_out_given_exact_token_in(
            1_000_000_000_000_000_000,
            500_000_000,
            1_000_000_000_000_000,
            2236021719197214567 << 1,
            10_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 2224287077214867);

        let amount_out = calc_pool_token_out_given_exact_token_in(
            1_000_000_000_000_000_000,
            500_000_000,
            1_000_000_000_000,
            2236021719197214567 << 1,
            10_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 2222605588882);

        let amount_out = calc_pool_token_out_given_exact_tokens_in(
            &vec![5_000_000_000_000_000_000, 1_000_000_000_000_000_000],
            &vec![500_000_000, 500_000_000],
            &vec![5_000_000_000_000_000 >> 1, 1_000_000_000_000_000 >> 1],
            2236021719197214567 << 1,
            10_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 2236003831023460);

        let amount_out = calc_pool_token_out_given_exact_tokens_in(
            &vec![5_000_000_000_000_000_000, 1_000_000_000_000_000_000],
            &vec![50_000_000, 950_000_000],
            &vec![5_000_000_000_000_000 >> 1, 1_000_000_000_000_000 >> 1],
            2236021719197214567 << 1,
            10_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 2235968054675953);
    }

    #[test]
    fn test_calc_token_out_given_exact_pool_token_in() {
        let amount_out = calc_token_out_given_exact_pool_token_in(
            5_000_000_000_000_000_000,
            500_000_000,
            2222605588882,
            2236021719197214567 << 1,
            10_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 4930225000000);

        let amount_out = calc_token_out_given_exact_pool_token_in(
            1_000_000_000_000_000_000,
            500_000_000,
            2222605588882,
            2236021719197214567 << 1,
            10_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 986045000000);

        let amount_out = calc_token_out_given_exact_pool_token_in(
            1_000_000_000_000_000_000,
            50_000_000,
            2222605588882,
            2236021719197214567 << 1,
            10_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 9814864500000);

        let amount_out = calc_token_out_given_exact_pool_token_in(
            1_000_000_000_000_000_000,
            950_000_000,
            2222605588882,
            2236021719197214567 << 1,
            10_000_000,
        )
        .unwrap();
        assert_eq!(amount_out, 532733500000);
    }
}
