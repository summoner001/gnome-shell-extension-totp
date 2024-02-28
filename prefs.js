/* prefs.js
 *
 * SPDX-License-Identifier: GPL-3.0-or-later
 */


const {Gio, GLib, GObject} = imports.gi;
const {Adw, Gtk, Gdk} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;

const Me = ExtensionUtils.getCurrentExtension();

const SecretUtils = Me.imports.secretUtils;
const TOTP = Me.imports.totp;

const _ = ExtensionUtils.gettext;
const pgettext = ExtensionUtils.pgettext;


Gio._promisify(Adw.MessageDialog.prototype, 'choose', 'choose_finish');


function init(metadata)
{
    ExtensionUtils.initTranslations(metadata.uuid);
}


function makeVariant({issuer, name, secret, digits, period, algorithm})
{
    let Variant = GLib.Variant;
    return new Variant('a{sv}',
                       {
                           issuer: Variant.new_string(issuer),
                           name: Variant.new_string(name),
                           digits: Variant.new_double(digits),
                           period: Variant.new_double(period),
                           algorithm: Variant.new_string(algorithm)
                       });
}


function copyToClipboard(text)
{
    // this runs outside gnome-shell, so we use GDK
    let display = Gdk.Display.get_default();
    let clipboard1 = display.get_primary_clipboard();
    let clipboard2 = display.get_clipboard();
    clipboard1.set(text);
    clipboard2.set(text);
}


function makeLabel({issuer, name})
{
    return `${issuer}: ${name}`;
}


function makeMarkupLabel({issuer, name})
{
    let safe_issuer = GLib.markup_escape_text(issuer, -1);
    let safe_name = GLib.markup_escape_text(name, -1);
    return `<b>${safe_issuer}:</b> ${safe_name}`;
}


async function reportError(parent, e, where)
{
    logError(e, where);
    try {
        let dialog = new Adw.MessageDialog({
            transient_for: parent,
            title: _('Error'),
            heading: where,
            body: e.message,
            modal: true,
        });
        dialog.add_response('close', _('_Close'));
        await dialog.choose(null);
        dialog.destroy();
    }
    catch (ee) {
        logError(ee, 'reportError()');
    }
}



class SecretRow extends Adw.ActionRow {

    static {
        GObject.registerClass(this);
    }


    constructor(args)
    {
        super({
            title: makeMarkupLabel(args),
            use_markup: true
        });

        this.add_suffix(new Gtk.Button({
            icon_name: 'edit-copy-symbolic',
            action_name: 'totp.copy',
            action_target: makeVariant(args),
            tooltip_text: _('Copy code to clipboard.')
        }));

        this.add_suffix(new Gtk.Button({
            icon_name: 'document-edit-symbolic',
            action_name: 'totp.edit',
            action_target: makeVariant(args),
            tooltip_text: _('Edit this secret.')
        }));

        this.add_suffix(new Gtk.Button({
            //icon_name: 'document-revert-symbolic-rtl',
            icon_name: 'send-to-symbolic',
            action_name: 'totp.export',
            action_target: makeVariant(args),
            tooltip_text: _('Export secret to clipboard.')
        }));

        this.add_suffix(new Gtk.Button({
            icon_name: 'edit-delete-symbolic',
            action_name: 'totp.remove',
            action_target: makeVariant(args),
            tooltip_text: _('Remove this secret.')
        }));

    }
};


class SecretDialog extends Gtk.Dialog {

    static {
        GObject.registerClass(this);
    }


    constructor(parent,
                title,
                totp,
                confirm,
                cancel)
    {
        let fields = totp.fields_non_destructive();

        super({
            transient_for: parent,
            modal: true,
            title: title,
            default_width: 400,
            // WORKAROUND: need header bar, otherwise the dialog is not centered
            use_header_bar: true
        });

        this._confirm_cb = confirm;
        this._cancel_cb = cancel;

        let group = new Adw.PreferencesGroup({
            title: title,
            margin_bottom: 12,
            margin_top: 12,
            margin_start: 12,
            margin_end: 12
        });
        this.get_content_area().append(group);

        this._ui = {};

        // UI: issuer
        this._ui.issuer = new Adw.EntryRow({
            title: _('Issuer'),
            text: fields.issuer,
            tooltip_text: _('The name of the organization (Google, Facebook, etc) that issued the OTP.')
        });
        group.add(this._ui.issuer);

        // UI: name
        this._ui.name = new Adw.EntryRow({
            title: _('Name'),
            text: fields.name
        });
        group.add(this._ui.name);

        // UI: secret
        this._ui.secret = new Adw.EntryRow({
            title: _('Secret'),
            text: fields.secret,
            tooltip_text: _('The secret key, encoded in base32.')
        });
        group.add(this._ui.secret);

        // UI: digits
        let digits_list = ['6', '7', '8'];
        this._ui.digits = new Adw.ComboRow({
            title: _('Digits'),
            model: new Gtk.StringList({
                strings: digits_list
            }),
            selected: digits_list.indexOf(fields.digits),
            tooltip_text: _('How many digits in the code.')
        });
        group.add(this._ui.digits);

        // UI: period
        let period_list = ['15', '30', '60'];
        this._ui.period = new Adw.ComboRow({
            title: _('Period'),
            subtitle: _('Time between code updates, in seconds.'),
            model: new Gtk.StringList({
                strings: period_list
            }),
            selected: period_list.indexOf(fields.period)
        });
        group.add(this._ui.period);

        // UI: algorithm
        let algorithm_list = ['SHA-1', 'SHA-256', 'SHA-512'];
        this._ui.algorithm = new Adw.ComboRow({
            title: _('Algorithm'),
            model: new Gtk.StringList({
                strings: algorithm_list
            }),
            selected: algorithm_list.indexOf(fields.algorithm),
            tooltip_text: _('The hash algoritm used to generate codes.')
        });
        group.add(this._ui.algorithm);


        // UI: confirm/cancel buttons
        this.add_button(_('_Cancel'), Gtk.ResponseType.CANCEL);
        let ok_button = this.add_button(_('_OK'), Gtk.ResponseType.OK);
        this.set_default_widget(ok_button);
    }


    on_response(response_id)
    {
        if (response_id == Gtk.ResponseType.OK) {
            this._confirm_cb(this.getFields());
        } else {
            if (this._cancel_cb)
                this._cancel_cb();
        }
    }


    getFields()
    {
        return {
            issuer: this._ui.issuer.text,
            name: this._ui.name.text,
            secret: this._ui.secret.text,
            digits: parseInt(this._ui.digits.selected_item.string),
            period: parseInt(this._ui.period.selected_item.string),
            algorithm: this._ui.algorithm.selected_item.string
        };
    }

};


class SecretsGroup extends Adw.PreferencesGroup {

    static {
        GObject.registerClass(this);

        this.install_action('totp.create', null,
                            obj => obj.createSecret());

        this.install_action('totp.import', null,
                            obj => obj.importSecrets());

        this.install_action('totp.export_all', null,
                            obj => obj.exportAllSecrets());

        this.install_action('totp.copy', "a{sv}",
                            (obj, _, arg) => obj.copyCode(arg.recursiveUnpack()));
        this.install_action('totp.edit', "a{sv}",
                            (obj, _, arg) => obj.editSecret(arg.recursiveUnpack()));
        this.install_action('totp.remove', "a{sv}",
                            (obj, _, arg) => obj.removeSecret(arg.recursiveUnpack()));
        this.install_action('totp.export', "a{sv}",
                            (obj, _, arg) => obj.exportSecret(arg.recursiveUnpack()));
    }


    constructor()
    {
        super({
            title: _('Secrets'),
            description: _('A list of all TOTP secrets from the keyring.')
        });


        let edit_row = new Adw.ActionRow();
        this.add(edit_row);

        edit_row.add_prefix(
            new Gtk.Button({
                action_name: 'totp.create',
                child: new Adw.ButtonContent({
                    label: _("Add secret"),
                    icon_name: 'list-add-symbolic'
                })
            })
        );

        edit_row.add_suffix(
            new Gtk.Button({
                action_name: 'totp.import',
                child: new Adw.ButtonContent({
                    label: _("Import secrets"),
                    icon_name: 'document-revert-symbolic'
                })
            })
        );

        edit_row.add_suffix(
            new Gtk.Button({
                action_name: 'totp.export_all',
                child: new Adw.ButtonContent({
                    label: _("Export all secrets"),
                    icon_name: 'send-to-symbolic'
                })
            })
        );

        this._rows = [];
        this.refreshRows();
    }


    addRow(args)
    {
        let row = new SecretRow(args);
        this._rows.push(row);
        this.add(row);
    }


    clearRows()
    {
        this._rows.forEach(row => this.remove(row));
        this._rows = [];
    }


    async refreshRows()
    {
        this.clearRows();
        try {
            let secrets = await SecretUtils.getList();
            secrets.forEach(item => this.addRow(item.get_attributes()));
        }
        catch (e) {
            logError(e, 'refreshRows()');
        }
    }


    createSecret()
    {
        let dialog = new SecretDialog(
            this.root,
            _('Creating new TOTP secret'),
            new TOTP.TOTP(),
            async (args) => {
                try {
                    let totp = new TOTP.TOTP(args);
                    let fields = totp.fields();
                    await SecretUtils.create(fields);
                    this.addRow(fields);
                    dialog.destroy();
                }
                catch (e) {
                    await reportError(dialog, e, 'createSecret()/confirm');
                }
            },
            () => dialog.destroy()
        );
        dialog.present();
    }


    async editSecret(args)
    {
        try {
            args.secret = await SecretUtils.get(args);

            let old_totp = new TOTP.TOTP(args);

            let dialog = new SecretDialog(
                this.root,
                _('Editing TOTP secret'),
                old_totp,
                async (new_args) => {
                    try {
                        let new_totp = new TOTP.TOTP(new_args);
                        await SecretUtils.update(old_totp.fields(), new_totp.fields());
                        dialog.destroy();
                        await this.refreshRows();
                    }
                    catch (e) {
                        await reportError(dialog, e, 'editSecret()/confirm');
                    }
                },
                () => dialog.destroy()
            );
            dialog.present();
        }
        catch (e) {
            await reportError(this.root, e, 'editSecret()');
        }
    }


    async removeSecret(args)
    {
        try {
            let dialog = new Adw.MessageDialog({
                transient_for: this.root,
                heading: _('Deleting TOTP secret'),
                body: pgettext('Deleting: "SECRET"', 'Deleting:')
                    + ` "${makeMarkupLabel(args)}"`,
                body_use_markup: true,
                default_response: 'delete',
                close_response: 'cancel'
            });
            dialog.add_response('cancel', _('_Cancel'));
            dialog.add_response('delete', _('_Delete'));
            dialog.set_response_appearance('delete', Adw.ResponseAppearance.DESTRUCTIVE);

            let response = await dialog.choose(null);

            if (response == 'delete') {
                let success = await SecretUtils.remove(args);
                if (!success)
                    throw new Error(_('Failed to remove secret. Is it locked?'));
                await this.refreshRows();
            }
        }
        catch (e) {
            await reportError(this.root, e, 'removeSecret()');
        }
    }


    async exportSecret(args)
    {
        try {
            args.secret = await SecretUtils.get(args);
            let totp = new TOTP.TOTP(args);
            let uri = totp.uri();
            copyToClipboard(uri);
        }
        catch (e) {
            await reportError(this.root, e, 'exportSecret()');
        }
    }


    async copyCode(args)
    {
        try {
            args.secret = await SecretUtils.get(args);
            let totp = new TOTP.TOTP(args);
            let code = totp.code();
            copyToClipboard(code);
        }
        catch (e) {
            await reportError(this.root, e, 'copyCode()');
        }
    }


    async importSecrets()
    {
        try {
            let dialog = new Adw.MessageDialog({
                transient_for: this.root,
                heading: _('Importing otpauth:// URIs'),
                body: _('Paste all "otpauth://" URIs you want import, one per line.'),
                default_width: 500,
                resizable: true,
                default_response: 'import',
                close_response: 'cancel',
                extra_child: new Gtk.ScrolledWindow({
                    vexpand: true,
                    hexpand: true,
                    child: new Gtk.TextView({
                        monospace: true
                    })
                })
            });
            dialog.add_response('cancel', _('_Cancel'));
            dialog.add_response('import', _('_Import'));
            dialog.set_response_appearance('import', Adw.ResponseAppearance.SUGGESTED);

            let response = await dialog.choose(null);
            if (response == 'import') {
                let text = dialog.extra_child.child.buffer.text;
                let uris = GLib.Uri.list_extract_uris(text);
                for (let i = 0; i < uris.length; ++i) {
                    try {
                        let totp = new TOTP.TOTP({uri: uris[i]});
                        await SecretUtils.create(totp.fields());
                    }
                    catch (e) {
                        await reportError(dialog, e, 'importSecrets()');
                    }
                }
                await this.refreshRows();
            }
        }
        catch (e) {
            await reportError(this.root, e, 'importSecrets()');
        }
    }


    async exportAllSecrets()
    {
        try {
            let uris = [];
            let list = await SecretUtils.getList();
            for (let i = 0; i < list.length; ++i) {
                let args = list[i].get_attributes();
                args.secret = await SecretUtils.get(args);
                let totp = new TOTP.TOTP(args);
                uris.push(totp.uri());
            }
            copyToClipboard(uris.join('\n'));
        }
        catch (e) {
            await reportError(this.root, e, 'exportAllSecrets()');
        }
    }

};


class SettingsPage extends Adw.PreferencesPage {

    static {
        GObject.registerClass(this);
    }

    constructor()
    {
        super();

        this.set_title("Test Title");
        this.set_name("Test Name");

        this.secrets = new SecretsGroup();
        this.add(this.secrets);

    }

};


function buildPrefsWidget()
{
    return new SettingsPage();
}
