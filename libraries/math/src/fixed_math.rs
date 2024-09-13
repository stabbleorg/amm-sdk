use bn::safe_math::CheckedMulDiv;
use fixed::types::U34F30;
use fixed_exp::FixedPowF;

pub const ZERO: u64 = 0;

pub const ONE: u64 = 1_000_000_000;

pub const TWO: u64 = 2_000_000_000;

pub const FOUR: u64 = 4_000_000_000;

pub const SCALE: u32 = 9;

pub const BITS_ONE: u64 = 1073741824; // 1 << 30

pub trait FixedPow<RHS = Self> {
    /// Output type for the methods of this trait.
    type Output;

    fn pow_down(self, rhs: RHS) -> Option<Self::Output>;

    fn pow_up(self, rhs: RHS) -> Option<Self::Output>;
}

pub trait FixedMul<RHS = Self> {
    /// Output type for the methods of this trait.
    type Output;

    fn mul_down(self, rhs: RHS) -> Option<Self::Output>;

    fn mul_up(self, rhs: RHS) -> Option<Self::Output>;
}

pub trait FixedDiv<RHS = Self> {
    /// Output type for the methods of this trait.
    type Output;

    fn div_down(self, rhs: RHS) -> Option<Self::Output>;

    fn div_up(self, rhs: RHS) -> Option<Self::Output>;
}

pub trait FixedComplement<RHS = Self> {
    /// Output type for the methods of this trait.
    type Output;

    fn complement(self) -> Self::Output;
}

impl FixedPow for u64 {
    type Output = u64;
    // Optimize for when y equals 1.0, 2.0 or 4.0, as those are very simple to implement and occur often in 50/50
    // and 80/20 Weighted Pools

    fn pow_down(self, rhs: Self) -> Option<Self::Output> {
        match rhs {
            ZERO => Some(ONE),
            ONE => Some(self),
            TWO => self.mul_down(self),
            FOUR => {
                let square = self.mul_down(self)?;
                square.mul_down(square)
            }
            _ => {
                let base = U34F30::from_bits(self.mul_down(BITS_ONE)?);
                let exp = U34F30::from_bits(rhs.mul_down(BITS_ONE)?);
                base.powf(exp)?.to_bits().div_down(BITS_ONE)
            }
        }
    }

    fn pow_up(self, rhs: Self) -> Option<Self::Output> {
        match rhs {
            ZERO => Some(ONE),
            ONE => Some(self),
            TWO => self.mul_up(self),
            FOUR => {
                let square = self.mul_up(self)?;
                square.mul_up(square)
            }
            _ => {
                let base = U34F30::from_bits(self.mul_up(BITS_ONE)?);
                let exp = U34F30::from_bits(rhs.mul_up(BITS_ONE)?);
                base.powf(exp)?.to_bits().div_up(BITS_ONE)
            }
        }
    }
}

impl FixedMul for u64 {
    type Output = u64;

    fn mul_down(self, rhs: Self) -> Option<Self::Output> {
        self.checked_mul_div_down(rhs, ONE)
    }

    fn mul_up(self, rhs: Self) -> Option<Self::Output> {
        self.checked_mul_div_up(rhs, ONE)
    }
}

impl FixedDiv for u64 {
    type Output = u64;

    fn div_down(self, rhs: Self) -> Option<Self::Output> {
        self.checked_mul_div_down(ONE, rhs)
    }

    fn div_up(self, rhs: Self) -> Option<Self::Output> {
        self.checked_mul_div_up(ONE, rhs)
    }
}

impl FixedComplement for u64 {
    type Output = u64;

    fn complement(self) -> Self::Output {
        ONE.saturating_sub(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::weighted_math::MAX_SAFE_BALANCE;

    pub const MAX_INVARIANT_RATIO: u64 = 999_999_999; // 0.999999999
    pub const MIN_INVARIANT_RATIO: u64 = 700_000_000; // 0.7

    pub const AVAILABLE_WEIGHTS: [u64; 30] = [
        100_000_000, // 10%
        150_000_000, // 15%
        200_000_000, // 20%
        250_000_000, // 25%
        300_000_000, // 30%
        350_000_000, // 35%
        400_000_000, // 40%
        450_000_000, // 45%
        500_000_000, // 50%
        550_000_000, // 55%
        600_000_000, // 60%
        650_000_000, // 65%
        700_000_000, // 70%
        750_000_000, // 75%
        800_000_000, // 80%
        900_000_000, // 90%
        111_111_111,
        137_137_137,
        222_222_222,
        247_247_247,
        333_333_333,
        377_377_377,
        444_444_444,
        473_473_473,
        555_555_555,
        589_589_589,
        666_666_666,
        699_888_999,
        777_777_777,
        888_888_888,
    ];

    #[test]
    fn test_powers_for_invariant() {
        for normalized_weight in AVAILABLE_WEIGHTS.clone() {
            let value = ((MAX_SAFE_BALANCE as f64 / 1e9).powf(normalized_weight as f64 / 1e9) * 1e9) as u64;
            let value_1 = MAX_SAFE_BALANCE.pow_down(normalized_weight).unwrap();
            let value_2 = MAX_SAFE_BALANCE.pow_up(normalized_weight).unwrap();
            check_epsilon(value, value_1);
            check_epsilon(value, value_2);
            assert!(value_2 >= value_1);
        }
    }

    #[test]
    fn test_powers_for_deposit() {
        for normalized_weight in AVAILABLE_WEIGHTS.clone() {
            let value = ((MIN_INVARIANT_RATIO as f64 / 1e9).powf(normalized_weight as f64 / 1e9) * 1e9) as u64;
            let value_1 = MIN_INVARIANT_RATIO.pow_down(normalized_weight).unwrap();
            let value_2 = MIN_INVARIANT_RATIO.pow_up(normalized_weight).unwrap();
            check_epsilon(value, value_1);
            check_epsilon(value, value_2);
            assert!(value_2 >= value_1);
        }
    }

    #[test]
    fn test_powers_for_withdraw() {
        for normalized_weight in AVAILABLE_WEIGHTS.clone() {
            let exp = ONE.div_down(normalized_weight).unwrap();
            let value = ((MAX_INVARIANT_RATIO as f64 / 1e9).powf(exp as f64 / 1e9) * 1e9) as u64;
            let value_1 = MAX_INVARIANT_RATIO.pow_down(exp).unwrap();
            let value_2 = MAX_INVARIANT_RATIO.pow_up(exp).unwrap();
            check_epsilon(value, value_1);
            check_epsilon(value, value_2);
            assert!(value_2 >= value_1);
        }
    }

    #[test]
    fn test_powers_for_swap() {
        for w_i in AVAILABLE_WEIGHTS.clone() {
            for w_o in AVAILABLE_WEIGHTS.clone() {
                let exp = w_i.div_up(w_o).unwrap();
                let value = ((MAX_INVARIANT_RATIO as f64 / 1e9).powf(exp as f64 / 1e9) * 1e9) as u64;
                let value_1 = MAX_INVARIANT_RATIO.pow_down(exp).unwrap();
                let value_2 = MAX_INVARIANT_RATIO.pow_up(exp).unwrap();
                check_epsilon(value, value_1);
                check_epsilon(value, value_2);
                assert!(value_2 >= value_1);

                let exp = w_o.div_up(w_i).unwrap();
                let value = ((MAX_INVARIANT_RATIO as f64 / 1e9).powf(exp as f64 / 1e9) * 1e9) as u64;
                let value_1 = MAX_INVARIANT_RATIO.pow_down(exp).unwrap();
                let value_2 = MAX_INVARIANT_RATIO.pow_up(exp).unwrap();
                check_epsilon(value, value_1);
                check_epsilon(value, value_2);
                assert!(value_2 >= value_1);
            }
        }
    }

    fn check_epsilon(exact: u64, similar: u64) {
        let diff = if exact > similar {
            exact - similar
        } else {
            similar - exact
        };

        assert!(diff.div_up(exact).unwrap() < 100); // 0.00001%
    }
}
