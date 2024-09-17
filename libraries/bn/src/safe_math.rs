use crate::{uint192, U192};

/// Trait for calculating `val * num / denom` with different rounding modes and overflow
/// protection.
///
/// Implementations of this trait have to ensure that even if the result of the multiplication does
/// not fit into the type, as long as it would fit after the division the correct result has to be
/// returned instead of `None`. `None` only should be returned if the overall result does not fit
/// into the type.
///
/// This specifically means that e.g. the `u64` implementation must, depending on the arguments, be
/// able to do 128 bit integer multiplication.
pub trait CheckedMulDiv<RHS = Self> {
    /// Output type for the methods of this trait.
    type Output;

    /// Calculates `floor(val * num / denom)`, i.e. the largest integer less than or equal to the
    /// result of the division.
    fn checked_mul_div_down(self, num: RHS, denom: RHS) -> Option<Self::Output>;

    /// Calculates `ceil(val * num / denom)`, i.e. the the smallest integer greater than or equal to
    /// the result of the division.
    fn checked_mul_div_up(self, num: RHS, denom: RHS) -> Option<Self::Output>;
}

pub trait CheckedDivCeil<RHS = Self> {
    /// Output type for the methods of this trait.
    type Output;

    /// Calculates `ceil(val / denom)`, i.e. the the smallest integer greater than or equal to
    /// the result of the division.
    fn checked_div_up(self, denom: RHS) -> Option<Self::Output>;
}

pub trait CheckedDivFloor<RHS = Self> {
    /// Output type for the methods of this trait.
    type Output;

    /// Calculates `floor(val / denom)`, i.e. the largest integer less than or equal to the
    /// result of the division.
    fn checked_div_down(self, denom: RHS) -> Option<Self::Output>;
}

pub trait Upcast {
    fn as_u192(self) -> U192;
}

pub trait Downcast {
    fn as_u64(self) -> Option<u64>;
}

impl Upcast for u128 {
    fn as_u192(self) -> U192 {
        uint192!(self)
    }
}

impl Downcast for U192 {
    fn as_u64(self) -> Option<u64> {
        if !self.fits_word() {
            return None;
        }

        Some(self.0[0])
    }
}

impl CheckedMulDiv for u64 {
    type Output = u64;

    fn checked_mul_div_down(self, num: Self, denom: Self) -> Option<Self::Output> {
        if denom == 0 {
            return None;
        }

        let r = (self as u128).checked_mul(num as u128)?.checked_div(denom as u128)?;
        if r > u64::MAX as u128 {
            None
        } else {
            Some(r as u64)
        }
    }

    fn checked_mul_div_up(self, num: Self, denom: Self) -> Option<Self::Output> {
        if denom == 0 {
            return None;
        }

        let r = (self as u128)
            .checked_mul(num as u128)?
            .checked_add(denom.saturating_sub(1) as u128)?
            .checked_div(denom as u128)?;
        if r > u64::MAX as u128 {
            None
        } else {
            Some(r as u64)
        }
    }
}

impl CheckedDivCeil for u64 {
    type Output = u64;

    fn checked_div_up(self, denom: Self) -> Option<Self::Output> {
        if denom == 0 {
            return None;
        }

        let r = (self as u128)
            .checked_add(denom.saturating_sub(1) as u128)?
            .checked_div(denom as u128)?;
        if r > u64::MAX as u128 {
            None
        } else {
            Some(r as u64)
        }
    }
}

impl CheckedMulDiv for U192 {
    type Output = U192;

    fn checked_mul_div_down(self, num: Self, denom: Self) -> Option<Self::Output> {
        if denom == U192::default() {
            return None;
        }

        let r = self.checked_mul(num)?.checked_div(denom)?;
        if r > u128::MAX.as_u192() {
            None
        } else {
            Some(r)
        }
    }

    fn checked_mul_div_up(self, num: Self, denom: Self) -> Option<Self::Output> {
        if denom == U192::default() {
            return None;
        }

        let r = self.checked_mul(num)?.checked_add(denom - 1)?.checked_div(denom)?;
        if r > u128::MAX.as_u192() {
            None
        } else {
            Some(r)
        }
    }
}

impl CheckedDivCeil for U192 {
    type Output = U192;

    fn checked_div_up(self, denom: Self) -> Option<Self::Output> {
        if denom == U192::default() {
            return None;
        }

        let r = self.checked_add(denom - 1)?.checked_div(denom)?;
        if r > u128::MAX.as_u192() {
            None
        } else {
            Some(r)
        }
    }
}

impl CheckedDivFloor for U192 {
    type Output = U192;

    fn checked_div_down(self, denom: Self) -> Option<Self::Output> {
        if denom == U192::default() {
            return None;
        }

        let r = self.checked_div(denom)?;
        if r > u128::MAX.as_u192() {
            None
        } else {
            Some(r)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_casting_overflow() {
        assert_eq!(uint192!(0), U192::zero());
        assert_eq!(U192::one().as_u64().unwrap(), 1);
        assert_eq!(uint192!(u64::MAX).as_u64().unwrap(), u64::MAX);
        assert_eq!(uint192!(u64::MAX).checked_add(U192::one()).unwrap().as_u64(), None);
        assert_eq!(uint192!(u128::MAX).as_u128(), u128::MAX);
        assert_eq!(uint192!(u128::MAX), u128::MAX.as_u192());
    }
}
