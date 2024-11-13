/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/weighted_swap.json`.
 */
export type WeightedSwap = {
  "address": "swapFpHZwjELNnjvThjajtiVmkz3yPQEHjLtka2fwHW",
  "metadata": {
    "name": "weightedSwap",
    "version": "1.3.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "acceptOwner",
      "discriminator": [
        176,
        23,
        41,
        28,
        23,
        111,
        8,
        4
      ],
      "accounts": [
        {
          "name": "pendingOwner",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "changeSwapFee",
      "discriminator": [
        231,
        15,
        132,
        51,
        132,
        165,
        64,
        170
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "newSwapFee",
          "type": "u64"
        }
      ]
    },
    {
      "name": "deposit",
      "docs": [
        "add liquidity"
      ],
      "discriminator": [
        242,
        35,
        198,
        137,
        82,
        225,
        242,
        182
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "userPoolToken",
          "writable": true
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "poolAuthority"
        },
        {
          "name": "vault"
        },
        {
          "name": "vaultAuthority"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "tokenProgram2022"
        }
      ],
      "args": [
        {
          "name": "amounts",
          "type": {
            "vec": "u64"
          }
        },
        {
          "name": "minimumAmountOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "initialize",
      "docs": [
        "initialize a pool"
      ],
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "mint"
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "poolAuthority"
        },
        {
          "name": "withdrawAuthority"
        },
        {
          "name": "vault"
        }
      ],
      "args": [
        {
          "name": "swapFee",
          "type": "u64"
        },
        {
          "name": "weights",
          "type": {
            "vec": "u64"
          }
        },
        {
          "name": "maxCaps",
          "type": {
            "vec": "u64"
          }
        }
      ]
    },
    {
      "name": "pause",
      "discriminator": [
        211,
        22,
        221,
        251,
        74,
        121,
        193,
        47
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "rejectOwner",
      "discriminator": [
        238,
        206,
        198,
        215,
        51,
        178,
        133,
        228
      ],
      "accounts": [
        {
          "name": "pendingOwner",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "shutdown",
      "docs": [
        "shutdown the zero-liquidity pool"
      ],
      "discriminator": [
        146,
        204,
        241,
        213,
        86,
        21,
        253,
        211
      ],
      "accounts": [
        {
          "name": "owner",
          "writable": true
        },
        {
          "name": "pool",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "swap",
      "docs": [
        "swap"
      ],
      "discriminator": [
        248,
        198,
        158,
        145,
        225,
        117,
        135,
        200
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "userTokenIn",
          "writable": true
        },
        {
          "name": "userTokenOut",
          "writable": true
        },
        {
          "name": "vaultTokenIn",
          "writable": true
        },
        {
          "name": "vaultTokenOut",
          "writable": true
        },
        {
          "name": "beneficiaryTokenOut",
          "writable": true
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "withdrawAuthority"
        },
        {
          "name": "vault"
        },
        {
          "name": "vaultAuthority"
        },
        {
          "name": "vaultProgram"
        },
        {
          "name": "tokenProgram"
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "minimumAmountOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "swapV2",
      "discriminator": [
        43,
        4,
        237,
        11,
        26,
        201,
        30,
        98
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "mintIn"
        },
        {
          "name": "mintOut"
        },
        {
          "name": "userTokenIn",
          "writable": true
        },
        {
          "name": "userTokenOut",
          "writable": true
        },
        {
          "name": "vaultTokenIn",
          "writable": true
        },
        {
          "name": "vaultTokenOut",
          "writable": true
        },
        {
          "name": "beneficiaryTokenOut",
          "writable": true
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "withdrawAuthority"
        },
        {
          "name": "vault"
        },
        {
          "name": "vaultAuthority"
        },
        {
          "name": "vaultProgram"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "token2022Program"
        }
      ],
      "args": [
        {
          "name": "amountIn",
          "type": {
            "option": "u64"
          }
        },
        {
          "name": "minimumAmountOut",
          "type": "u64"
        }
      ]
    },
    {
      "name": "transferOwner",
      "discriminator": [
        245,
        25,
        221,
        175,
        106,
        229,
        225,
        45
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "newOwner",
          "type": "pubkey"
        }
      ]
    },
    {
      "name": "unpause",
      "discriminator": [
        169,
        144,
        4,
        38,
        10,
        141,
        188,
        255
      ],
      "accounts": [
        {
          "name": "owner",
          "signer": true
        },
        {
          "name": "pool",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "withdraw",
      "docs": [
        "remove liquidity"
      ],
      "discriminator": [
        183,
        18,
        70,
        156,
        148,
        109,
        161,
        34
      ],
      "accounts": [
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "userPoolToken",
          "writable": true
        },
        {
          "name": "mint",
          "writable": true
        },
        {
          "name": "pool",
          "writable": true
        },
        {
          "name": "withdrawAuthority"
        },
        {
          "name": "vault"
        },
        {
          "name": "vaultAuthority"
        },
        {
          "name": "vaultProgram"
        },
        {
          "name": "tokenProgram"
        },
        {
          "name": "tokenProgram2022"
        }
      ],
      "args": [
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "minimumAmountsOut",
          "type": {
            "vec": "u64"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "pool",
      "discriminator": [
        241,
        154,
        109,
        4,
        17,
        177,
        109,
        188
      ]
    },
    {
      "name": "vault",
      "discriminator": [
        211,
        8,
        232,
        43,
        2,
        152,
        117,
        119
      ]
    }
  ],
  "events": [
    {
      "name": "poolBalanceUpdatedEvent",
      "discriminator": [
        172,
        82,
        114,
        207,
        27,
        103,
        211,
        4
      ]
    },
    {
      "name": "poolUpdatedEvent",
      "discriminator": [
        128,
        39,
        94,
        221,
        230,
        222,
        127,
        141
      ]
    }
  ],
  "types": [
    {
      "name": "pool",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "vault",
            "type": "pubkey"
          },
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "authorityBump",
            "type": "u8"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "invariant",
            "type": "u64"
          },
          {
            "name": "swapFee",
            "type": "u64"
          },
          {
            "name": "tokens",
            "type": {
              "vec": {
                "defined": {
                  "name": "poolToken"
                }
              }
            }
          },
          {
            "name": "pendingOwner",
            "type": {
              "option": "pubkey"
            }
          }
        ]
      }
    },
    {
      "name": "poolBalanceUpdatedData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "balances",
            "type": {
              "vec": "u64"
            }
          }
        ]
      }
    },
    {
      "name": "poolBalanceUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pubkey",
            "type": "pubkey"
          },
          {
            "name": "data",
            "type": {
              "defined": {
                "name": "poolBalanceUpdatedData"
              }
            }
          }
        ]
      }
    },
    {
      "name": "poolToken",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "mint",
            "type": "pubkey"
          },
          {
            "name": "decimals",
            "type": "u8"
          },
          {
            "name": "scalingUp",
            "type": "bool"
          },
          {
            "name": "scalingFactor",
            "type": "u64"
          },
          {
            "name": "balance",
            "type": "u64"
          },
          {
            "name": "weight",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "poolUpdatedData",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "swapFee",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "poolUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "pubkey",
            "type": "pubkey"
          },
          {
            "name": "data",
            "type": {
              "defined": {
                "name": "poolUpdatedData"
              }
            }
          }
        ]
      }
    },
    {
      "name": "vault",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "withdrawAuthority",
            "docs": [
              "PDA of pool programs seeded by vault address"
            ],
            "type": "pubkey"
          },
          {
            "name": "withdrawAuthorityBump",
            "docs": [
              "bump seed of withdraw_authority PDA"
            ],
            "type": "u8"
          },
          {
            "name": "authorityBump",
            "docs": [
              "bump seed of vault_authority PDA"
            ],
            "type": "u8"
          },
          {
            "name": "isActive",
            "type": "bool"
          },
          {
            "name": "beneficiary",
            "type": "pubkey"
          },
          {
            "name": "beneficiaryFee",
            "type": "u64"
          },
          {
            "name": "pendingAdmin",
            "type": {
              "option": "pubkey"
            }
          }
        ]
      }
    }
  ]
};
