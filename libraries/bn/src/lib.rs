pub mod safe_math;

use uint::construct_uint;

construct_uint! {
    pub struct U192(3);
}

#[macro_export]
macro_rules! uint192 {
    ($value:expr) => {
        U192::from($value)
    };
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_shift_for_div_by_2() {
        assert_eq!(uint192!(u128::MAX) >> 1, uint192!(u128::MAX) / (uint192!(2)));
    }

    #[test]
    fn test_shift_for_mul_by_2() {
        assert_eq!(uint192!(u128::MAX) << 1, uint192!(u128::MAX) * uint192!(2));
    }
}
