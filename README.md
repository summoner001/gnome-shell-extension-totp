TOTP
====

This is a GNOME Shell extension to generate TOTP (Time-based OTP) authentication codes
(such as the ones used by Google, Facebook, Github, Steam, etc).

![screenshot](screenshot.png)


Security
--------

The OTP secret is stored in the [GNOME
Keyring](https://wiki.gnome.org/Projects/GnomeKeyring), in a separate collection called
"OTP". For improved security, users can lock this collection with its own password.

During normal usage, the extension will load the specific OTP secret (unlocking the
Keyring if necessary), copy the authentication code to the clipboard, and immediately wipe
the OTP secret from memory.


Installing from GNOME Shell Extensions website
----------------------------------------------

The extension can be obtained from the [GNOME Shell Extensions
website](https://extensions.gnome.org/extension/6793/totp/).


Installing from sources
-----------------------

Prerequisites:

  - [make](https://www.gnu.org/software/make/)

  - [jq](https://stedolan.github.io/jq/)

Run:

    make install


Importing and exporting URIs
----------------------------

It's possible to import and export OTP secrets that conform to [Google's Key URI
Format](https://github.com/google/google-authenticator/wiki/Key-Uri-Format). This format
is compatible with applications like Google Authenticator, FreeOTP, Authy, etc.


Exporting QR code
-----------------

It's possible to export the OTP secret as a QR code to be scanned into other devices, if
you have the [qrencode](https://fukuchi.org/works/qrencode/) package installed.


Importing Steam Guard secret
----------------------------

You can generate Steam Guard Mobile Authenticator codes.

  1. Search the web for instructions on how to extract your Steam Guard
     `shared_secret`. The method may vary depending on factors like your Android version,
     rooted status, Steam Mobile version, etc.

  2. The `shared_secret` is encoded in `Base64`, not `Base32`; so when you import it,
     select `Base64`. The secret will still be stored in the keyring in `Base32` encoding,
     so don't be alarmed that it "changed" after you saved it.

  3. Set `Digits = 5`. Everything else is the default: `Period = 30`, `Algorithm = SHA-1`.

  4. The issuer must be `Steam`, to activate the special OTP encoding that Steam Guard
     uses, using letters. Otherwise it will generate authentication codes in decimal,
     which are not recognized by Steam.


Related extensions
------------------

When using this extension on a laptop, it's a good idea to also install [Keyring
Autolock](https://extensions.gnome.org/extension/6846/keyring-autolock/). It will ensure
your Keyring gets locked after a period of time, so you never forget to keep your OTP
secrets protected.
