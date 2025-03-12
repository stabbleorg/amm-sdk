/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/vault.json`.
 */
export type Vault = {
  address: "vo1tWgqZMjG61Z2T9qUaMYKqZ75CYzMuaZ2LZP1n7HV";
  metadata: {
    name: "vault";
    version: "1.5.0";
    spec: "0.1.0";
    description: "Created with Anchor";
  };
  instructions: [
    {
      name: "acceptAdmin";
      discriminator: [112, 42, 45, 90, 116, 181, 13, 170];
      accounts: [
        {
          name: "pendingAdmin";
          signer: true;
        },
        {
          name: "vault";
          writable: true;
        },
      ];
      args: [];
    },
    {
      name: "changeBeneficiary";
      discriminator: [110, 79, 77, 10, 30, 181, 18, 1];
      accounts: [
        {
          name: "admin";
          signer: true;
        },
        {
          name: "vault";
          writable: true;
        },
      ];
      args: [
        {
          name: "newBeneficiary";
          type: "pubkey";
        },
      ];
    },
    {
      name: "changeBeneficiaryFee";
      discriminator: [47, 164, 28, 91, 72, 42, 199, 21];
      accounts: [
        {
          name: "admin";
          signer: true;
        },
        {
          name: "vault";
          writable: true;
        },
      ];
      args: [
        {
          name: "newBeneficiaryFee";
          type: "u64";
        },
      ];
    },
    {
      name: "initialize";
      discriminator: [175, 175, 109, 31, 13, 152, 155, 237];
      accounts: [
        {
          name: "admin";
          signer: true;
        },
        {
          name: "vault";
          writable: true;
        },
        {
          name: "vaultAuthority";
        },
      ];
      args: [
        {
          name: "withdrawAuthority";
          type: "pubkey";
        },
        {
          name: "withdrawAuthorityBump";
          type: "u8";
        },
        {
          name: "beneficiary";
          type: "pubkey";
        },
        {
          name: "beneficiaryFee";
          type: "u64";
        },
      ];
    },
    {
      name: "pause";
      discriminator: [211, 22, 221, 251, 74, 121, 193, 47];
      accounts: [
        {
          name: "admin";
          signer: true;
        },
        {
          name: "vault";
          writable: true;
        },
      ];
      args: [];
    },
    {
      name: "rejectAdmin";
      discriminator: [253, 12, 169, 115, 88, 117, 177, 252];
      accounts: [
        {
          name: "pendingAdmin";
          signer: true;
        },
        {
          name: "vault";
          writable: true;
        },
      ];
      args: [];
    },
    {
      name: "transferAdmin";
      discriminator: [42, 242, 66, 106, 228, 10, 111, 156];
      accounts: [
        {
          name: "admin";
          signer: true;
        },
        {
          name: "vault";
          writable: true;
        },
      ];
      args: [
        {
          name: "newAdmin";
          type: "pubkey";
        },
      ];
    },
    {
      name: "unpause";
      discriminator: [169, 144, 4, 38, 10, 141, 188, 255];
      accounts: [
        {
          name: "admin";
          signer: true;
        },
        {
          name: "vault";
          writable: true;
        },
      ];
      args: [];
    },
    {
      name: "withdraw";
      discriminator: [183, 18, 70, 156, 148, 109, 161, 34];
      accounts: [
        {
          name: "withdrawAuthority";
          signer: true;
        },
        {
          name: "vault";
        },
        {
          name: "vaultAuthority";
        },
        {
          name: "vaultToken";
          writable: true;
        },
        {
          name: "destToken";
          writable: true;
        },
        {
          name: "tokenProgram";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
        {
          name: "beneficiaryAmount";
          type: "u64";
        },
      ];
    },
    {
      name: "withdrawV2";
      discriminator: [242, 80, 163, 0, 196, 221, 194, 194];
      accounts: [
        {
          name: "withdrawAuthority";
          signer: true;
        },
        {
          name: "vault";
        },
        {
          name: "vaultAuthority";
        },
        {
          name: "vaultToken";
          writable: true;
        },
        {
          name: "destToken";
          writable: true;
        },
        {
          name: "beneficiaryToken";
          writable: true;
          optional: true;
        },
        {
          name: "mint";
        },
        {
          name: "tokenProgram";
        },
      ];
      args: [
        {
          name: "amount";
          type: "u64";
        },
        {
          name: "beneficiaryAmount";
          type: "u64";
        },
      ];
    },
  ];
  accounts: [
    {
      name: "vault";
      discriminator: [211, 8, 232, 43, 2, 152, 117, 119];
    },
  ];
  events: [
    {
      name: "vaultUpdatedEvent";
      discriminator: [11, 93, 32, 99, 27, 33, 188, 225];
    },
  ];
  errors: [
    {
      code: 6000;
      name: "slippageExceeded";
      msg: "Slippage exceeded";
    },
    {
      code: 6001;
      name: "notSupportedMint";
      msg: "Not supported mint";
    },
    {
      code: 6002;
      name: "maxSupplyExceeded";
      msg: "Max supply exceeded";
    },
  ];
  types: [
    {
      name: "vault";
      type: {
        kind: "struct";
        fields: [
          {
            name: "admin";
            type: "pubkey";
          },
          {
            name: "withdrawAuthority";
            docs: ["PDA of pool programs seeded by vault address"];
            type: "pubkey";
          },
          {
            name: "withdrawAuthorityBump";
            docs: ["bump seed of withdraw_authority PDA"];
            type: "u8";
          },
          {
            name: "authorityBump";
            docs: ["bump seed of vault_authority PDA"];
            type: "u8";
          },
          {
            name: "isActive";
            type: "bool";
          },
          {
            name: "beneficiary";
            type: "pubkey";
          },
          {
            name: "beneficiaryFee";
            type: "u64";
          },
          {
            name: "pendingAdmin";
            type: {
              option: "pubkey";
            };
          },
        ];
      };
    },
    {
      name: "vaultUpdatedData";
      type: {
        kind: "struct";
        fields: [
          {
            name: "isActive";
            type: "bool";
          },
          {
            name: "beneficiaryFee";
            type: "u64";
          },
        ];
      };
    },
    {
      name: "vaultUpdatedEvent";
      type: {
        kind: "struct";
        fields: [
          {
            name: "pubkey";
            type: "pubkey";
          },
          {
            name: "data";
            type: {
              defined: {
                name: "vaultUpdatedData";
              };
            };
          },
        ];
      };
    },
  ];
};
