use crate::fixed_math::FixedMul;

pub fn calc_swap_fee_in_discount(swap_fee: u64, x_amount: u64) -> Option<u64> {
    // No discount
    if x_amount < 100_000_000_000_000 {
        Some(swap_fee)
    }
    // 10% discount
    else if x_amount < 200_000_000_000_000 {
        swap_fee.mul_up(900_000_000)
    }
    // 20% discount
    else if x_amount < 400_000_000_000_000 {
        swap_fee.mul_up(800_000_000)
    }
    // 30% discount
    else if x_amount < 800_000_000_000_000 {
        swap_fee.mul_up(700_000_000)
    }
    // 40% discount
    else if x_amount < 1_600_000_000_000_000 {
        swap_fee.mul_up(600_000_000)
    }
    // 50% discount
    else if x_amount < 3_200_000_000_000_000 {
        swap_fee.mul_up(500_000_000)
    }
    // 60% discount
    else if x_amount < 6_400_000_000_000_000 {
        swap_fee.mul_up(400_000_000)
    }
    // 70% discount
    else if x_amount < 12_800_000_000_000_000 {
        swap_fee.mul_up(300_000_000)
    }
    // 80% discount
    else if x_amount < 25_600_000_000_000_000 {
        swap_fee.mul_up(200_000_000)
    }
    // 90% discount
    else if x_amount < 51_200_000_000_000_000 {
        swap_fee.mul_up(100_000_000)
    }
    // 100% discount
    else {
        Some(0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    pub const SWAP_FEE: u64 = 10_000;

    #[test]
    fn test_swap_fee_in_discount() {
        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 99_999_999_999_999).unwrap();
        assert_eq!(swap_fee, SWAP_FEE);

        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 100_000_000_000_000).unwrap();
        assert_eq!(swap_fee, 9_000);
        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 199_999_999_999_999).unwrap();
        assert_eq!(swap_fee, 9_000);

        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 200_000_000_000_000).unwrap();
        assert_eq!(swap_fee, 8_000);
        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 399_999_999_999_999).unwrap();
        assert_eq!(swap_fee, 8_000);

        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 400_000_000_000_000).unwrap();
        assert_eq!(swap_fee, 7_000);
        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 799_999_999_999_999).unwrap();
        assert_eq!(swap_fee, 7_000);

        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 800_000_000_000_000).unwrap();
        assert_eq!(swap_fee, 6_000);
        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 1_599_999_999_999_999).unwrap();
        assert_eq!(swap_fee, 6_000);

        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 1_600_000_000_000_000).unwrap();
        assert_eq!(swap_fee, 5_000);
        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 3_199_999_999_999_999).unwrap();
        assert_eq!(swap_fee, 5_000);

        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 3_200_000_000_000_000).unwrap();
        assert_eq!(swap_fee, 4_000);
        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 6_399_999_999_999_999).unwrap();
        assert_eq!(swap_fee, 4_000);

        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 6_400_000_000_000_000).unwrap();
        assert_eq!(swap_fee, 3_000);
        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 12_799_999_999_999_999).unwrap();
        assert_eq!(swap_fee, 3_000);

        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 12_800_000_000_000_000).unwrap();
        assert_eq!(swap_fee, 2_000);
        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 25_599_999_999_999_999).unwrap();
        assert_eq!(swap_fee, 2_000);

        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 25_600_000_000_000_000).unwrap();
        assert_eq!(swap_fee, 1_000);
        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 51_199_999_999_999_999).unwrap();
        assert_eq!(swap_fee, 1_000);

        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 51_200_000_000_000_000).unwrap();
        assert_eq!(swap_fee, 0);
        let swap_fee = calc_swap_fee_in_discount(SWAP_FEE, 51_200_000_000_000_001).unwrap();
        assert_eq!(swap_fee, 0);
    }
}
