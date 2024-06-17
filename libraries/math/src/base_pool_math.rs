use bn::safe_math::CheckedMulDiv;

// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-utils/contracts/lib/BasePoolMath.sol#L22-L45
pub fn compute_proportional_amounts_in(balances: &Vec<u64>, pool_token_supply: u64, amount_out: u64) -> Vec<u64> {
    /************************************************************************************
    // computeProportionalAmountsIn                                                    //
    // (per token)                                                                     //
    // aI = amountIn                   /      lpOut      \                             //
    // b = balance           aI = b * | ----------------- |                            //
    // lpOut = lpAmountOut             \  lpTotalSupply  /                             //
    // lp = lpTotalSupply                                                              //
     ************************************************************************************/

    // Since we're computing amounts in, we round up overall. This means rounding up on both the
    // multiplication and division.

    let mut amounts_in: Vec<u64> = vec![];
    for i in 0..balances.len() {
        amounts_in.push(balances[i].checked_mul_div_up(amount_out, pool_token_supply).unwrap());
    }

    amounts_in
}

// See: https://github.com/stabbleorg/balancer-v2-monorepo/blob/master/pkg/pool-utils/contracts/lib/BasePoolMath.sol#L47-L70
pub fn compute_proportional_amounts_out(balances: &Vec<u64>, pool_token_supply: u64, amount_in: u64) -> Vec<u64> {
    /**********************************************************************************************
    // computeProportionalAmountsOut                                                             //
    // (per token)                                                                               //
    // aO = tokenAmountOut             /        lpIn          \                                  //
    // b = tokenBalance      a0 = b * | ---------------------  |                                 //
    // lpIn = lpAmountIn               \     lpTotalSupply    /                                  //
    // lp = lpTotalSupply                                                                        //
     **********************************************************************************************/

    // Since we're computing an amount out, we round down overall. This means rounding down on both the
    // multiplication and division.

    let mut amounts_out: Vec<u64> = vec![];
    for i in 0..balances.len() {
        amounts_out.push(balances[i].checked_mul_div_down(amount_in, pool_token_supply).unwrap());
    }

    amounts_out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_proportional_amounts() {
        let balances = vec![5_000_000_000, 3_000_000_000];
        let pool_token_supply = 1_000_000_000;

        let amounts_in = compute_proportional_amounts_in(&balances, pool_token_supply, 100_000_000);
        assert_eq!(amounts_in[0], 500000000);
        assert_eq!(amounts_in[1], 300000000);

        let amounts_out = compute_proportional_amounts_out(&balances, pool_token_supply, 100_000_000);
        assert_eq!(amounts_out[0], 500000000);
        assert_eq!(amounts_out[1], 300000000);

        let amounts_in = compute_proportional_amounts_in(&balances, pool_token_supply, 333_333_333);
        assert_eq!(amounts_in[0], 1666666665);
        assert_eq!(amounts_in[1], 999999999);

        let amounts_out = compute_proportional_amounts_out(&balances, pool_token_supply, 333_333_333);
        assert_eq!(amounts_out[0], 1666666665);
        assert_eq!(amounts_out[1], 999999999);

        let amounts_in = compute_proportional_amounts_in(&balances, pool_token_supply, 777_777_777);
        assert_eq!(amounts_in[0], 3888888885);
        assert_eq!(amounts_in[1], 2333333331);

        let amounts_out = compute_proportional_amounts_out(&balances, pool_token_supply, 777_777_777);
        assert_eq!(amounts_out[0], 3888888885);
        assert_eq!(amounts_out[1], 2333333331);
    }
}
